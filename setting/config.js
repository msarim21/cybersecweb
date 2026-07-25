const fs = require('fs')

global.owner = "8615507967005" //owner number
global.footer = "𝗖𝗬𝗕𝗘𝗥𝗦𝗘𝗖𝗣𝗥𝗢" //footer section
global.status = false //"self/public" section of the bot
global.prefa = ['','!','.','#','&']
global.owner = ['8615507967005']
global.xprefix = '.'
global.gambar = "https://files.catbox.moe/smv12k.jpeg"
global.OWNER_NAME = "@CYBERSECPRO"
global.DEVELOPER = ["8615507967005"]
global.BOT_NAME = "𝗖𝗬𝗕𝗘𝗥𝗦𝗘𝗖𝗣𝗥𝗢"
global.bankowner = "𝗖𝗬𝗕𝗘𝗥𝗦𝗘𝗖𝗣𝗥𝗢"
global.creatorName = "𝗚𝗔𝗠𝗘𝗖𝗛𝗔𝗡𝗚𝗘𝗥™"
global.ownernumber = '8615507967005'
global.location = "Pakistan"
global.link = "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc"
global.autobio = false
global.botName = "𝗖𝗬𝗕𝗘𝗥𝗦𝗘𝗖𝗣𝗥𝗢"
global.version = "1.0.1"
global.botname = "𝗖𝗬𝗕𝗘𝗥𝗦𝗘𝗖𝗣𝗥𝗢"
global.author = "𝗚𝗔𝗠𝗘𝗖𝗛𝗔𝗡𝗚𝗘𝗥™"
global.themeemoji = "🥷"
global.wagc = 'https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc'
global.thumbnail = 'https://files.catbox.moe/smv12k.jpeg'
global.richpp = ' '
global.packname = "Sticker By 𝗖𝗬𝗕𝗘𝗥𝗦𝗘𝗖𝗣𝗥𝗢"
global.author = "𝗚𝗔𝗠𝗘𝗖𝗛𝗔𝗡𝗚𝗘𝗥"
global.creator = "8615507967005@s.whatsapp.net"
global.ownername = 'GAMECHANGER'
global.onlyowner = `Only CYBERSECPRO dev can use this Command 🥶🥷`
global.database = `*To Exist In The Database Contact The Owner of this bot*`
global.mess = {
  wait: "*Configurating.......*",
  success: "*Successfully acknowledged ☑️*",
  on: "*Activated ✅*", 
  prem: "*Feature For Premium Users only*", 
  off: "*Deactivated 📛*",
  query: {
    text: "*Please, Provide A Text Query 📑*",
    link: "Please, provide a valid link 🔗*",
  },
  error: {
    fitur: "*Status 🌐: Feature Or Command error ❌*",
  },
  only: {
    group: "*Group only feature ❌*",
    private: "*Private chat feature only ❌*",
    owner: "*Owner feature only ❌*",
    admin: "*bot owner feature only ❌*",
    badmin: "*Seek admin privilege's to use this command ❌*",
    premium: "*Availabe for premium users only ❌*",
  }
}

global.hituet = 0
global.autoviewstatus = true
global.autoread = true
global.autobio = true
global.anti92 = false
global.autoswview = true

let file = require.resolve(__filename)
require('fs').watchFile(file, () => {
  require('fs').unwatchFile(file)
  console.log('\x1b[0;32m'+__filename+' \x1b[1;32mupdated!\x1b[0m')
  delete require.cache[file]
  require(file)
})
