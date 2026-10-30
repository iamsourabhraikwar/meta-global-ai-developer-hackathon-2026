import sys
import os
import json

# Ensure UTF-8 output on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

def resolve(url, browser=None):
    import yt_dlp

    # Strategy 1: Check for explicit cookies.txt (Never locks, completely safe)
    cookie_paths = [
        os.path.join(os.getcwd(), 'cookies.txt'),
        os.path.join(os.path.dirname(__file__), '..', 'cookies.txt')
    ]
    for cp in cookie_paths:
        if os.path.exists(cp):
            try:
                ydl = yt_dlp.YoutubeDL({'quiet': True, 'skip_download': True, 'cookiefile': cp})
                info = ydl.extract_info(url, download=False)
                return format_result(info)
            except Exception:
                pass

    # Strategy 2: If browser requested and not locked, try browser session
    if browser:
        try:
            ydl = yt_dlp.YoutubeDL({'quiet': True, 'skip_download': True, 'cookiesfrombrowser': (browser, None, None, None)})
            info = ydl.extract_info(url, download=False)
            return format_result(info)
        except Exception:
            pass

    # Strategy 3: Default clean live stream extraction (Most reliable on local PC)
    try:
        ydl = yt_dlp.YoutubeDL({'quiet': True, 'skip_download': True})
        info = ydl.extract_info(url, download=False)
        return format_result(info)
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def format_result(info):
    formats = info.get('formats', [])
    hls_url = info.get('manifest_url') or info.get('url')
    
    if not hls_url and formats:
        for f in reversed(formats):
            proto = f.get('protocol', '')
            furl = f.get('url', '')
            if 'm3u8' in proto or '.m3u8' in furl:
                hls_url = furl
                break
        if not hls_url:
            hls_url = formats[-1].get('url')

    return {
        "success": True,
        "title": info.get('title', 'Live CCTV Stream'),
        "streamUrl": hls_url,
        "isLive": bool(info.get('is_live') or info.get('live_status') == 'is_live')
    }

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No URL provided"}))
        sys.exit(1)
    target_url = sys.argv[1]
    browser_pref = sys.argv[2] if len(sys.argv) > 2 else None
    res = resolve(target_url, browser_pref)
    print(json.dumps(res))
