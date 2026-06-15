#!/usr/bin/env python3
import sys, json
try:
    from pytubefix import YouTube
    url = sys.argv[1] if len(sys.argv) > 1 else ""
    if not url:
        print(json.dumps({"status": "error", "error": "No URL provided"}))
        sys.exit(1)
    yt = YouTube(url)
    streams = yt.streams.filter(progressive=True, file_extension='mp4').order_by('resolution').desc()
    best = streams.first()
    if not best:
        raise Exception("No progressive mp4 stream found")
    result = {
        "status": "ok",
        "title": yt.title,
        "thumbnail": yt.thumbnail_url,
        "duration": yt.length,
        "author": yt.author,
        "views": yt.views,
        "video_url": best.url,
        "quality": best.resolution,
    }
    print(json.dumps(result))
except ImportError:
    print(json.dumps({"status": "error", "error": "pytubefix not installed"}))
except Exception as e:
    print(json.dumps({"status": "error", "error": str(e)}))
