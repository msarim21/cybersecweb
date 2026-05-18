const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const {
  getNumbersByOwner,
  countNumbersByOwner,
  addNumber,
  toggleNumber,
  deleteNumber,
  findUserById,
} = require('../db-service');

// Lazy-load stopBot from pair.js (bot process must be running)
function tryStopBot(numberStr) {
  try {
    const pairMod = require('../../pair');
    if (typeof pairMod.stopBot === 'function') pairMod.stopBot(numberStr);
  } catch (_) {}
}

// Lazy-load clearSession — wipes auth files so number can't auto-reconnect
function tryClearSession(numberStr) {
  try {
    const pairMod = require('../../pair');
    if (typeof pairMod.clearSession === 'function') pairMod.clearSession(numberStr);
  } catch (_) {}
}

function getPlanLimit(plan) {
  if (plan === 'pro') return 5;
  if (plan === 'enterprise') return 999;
  return 1; // free trial: 1 number only
}

function isTrialExpired(user) {
  if (!user.trial_expires_at) return false;
  if (user.subscription_plan === 'pro' || user.subscription_plan === 'enterprise') return false;
  return new Date(user.trial_expires_at) < new Date();
}

// GET /api/numbers
router.get('/', protect, async (req, res) => {
  try {
    const numbers = await getNumbersByOwner(req.user.id, req.query.search || null);
    res.json(numbers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/numbers
router.post('/', protect, async (req, res) => {
  try {
    const { number, botName } = req.body;
    if (!number || !botName)
      return res.status(400).json({ error: 'Number and bot name are required.' });

    const user = await findUserById(req.user.id);

    if (isTrialExpired(user)) {
      return res.status(403).json({
        error:   'TRIAL_EXPIRED',
        message: 'Your 24-hour free trial has expired. Please upgrade to Pro or Enterprise.',
      });
    }

    const plan  = user.subscription_plan;
    const limit = getPlanLimit(plan);
    const count = await countNumbersByOwner(req.user.id);

    if (count >= limit) {
      return res.status(403).json({
        error:   'PLAN_LIMIT_REACHED',
        message: `You have reached the ${plan.toUpperCase()} plan limit of ${limit} number(s).`,
        limit, plan,
      });
    }

    const newNumber = await addNumber(number, botName, req.user.id);
    res.status(201).json(newNumber);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/numbers/:id/toggle
router.put('/:id/toggle', protect, async (req, res) => {
  try {
    const updated = await toggleNumber(req.params.id, req.user.id);
    if (!updated) return res.status(404).json({ error: 'Number not found.' });
    // If toggled to inactive, stop the running bot
    if (updated.status === 'inactive' && updated.number) tryStopBot(updated.number);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/numbers/:id/disconnect
// Stops the bot, wipes session files (fresh pairing required to reconnect),
// and removes the DB record so the slot is freed immediately.
router.post('/:id/disconnect', protect, async (req, res) => {
  try {
    const deleted = await deleteNumber(req.params.id, req.user.id);
    if (!deleted) return res.status(404).json({ error: 'Number not found.' });
    if (deleted.number) {
      tryStopBot(deleted.number);      // kill running process
      tryClearSession(deleted.number); // wipe auth files → no auto-reconnect
    }
    res.json({ message: 'Number disconnected. Slot is now free.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/numbers/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    const deleted = await deleteNumber(req.params.id, req.user.id);
    if (!deleted) return res.status(404).json({ error: 'Number not found.' });
    // Stop the bot process for this number
    if (deleted.number) tryStopBot(deleted.number);
    res.json({ message: 'Number deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
