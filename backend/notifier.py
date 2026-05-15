
import requests
import os
from pathlib import Path
from datetime import datetime

class TelegramNotifier:
    
    def __init__(self, token: str = None, chat_id: str = None):
        self.token = token or os.getenv('TELEGRAM_TOKEN')
        self.chat_id = chat_id or os.getenv('TELEGRAM_CHAT_ID')
        
        if not self.token or not self.chat_id:
            print("[WARN]  Telegram credentials not configured")
            print("   Add TELEGRAM_TOKEN and TELEGRAM_CHAT_ID to .env")
            self.enabled = False
        else:
            self.enabled = True
            self.base_url = f"https://api.telegram.org/bot{self.token}"
    
    def send_alert(self, alert: dict, video_path: str = None) -> bool:
        if not self.enabled:
            return False
        
        try:
            message = self._format_alert_message(alert)
            
            response = requests.post(
                f"{self.base_url}/sendMessage",
                json={
                    'chat_id': self.chat_id,
                    'text': message,
                    'parse_mode': 'HTML'
                },
                timeout=10
            )
            
            if response.status_code != 200:
                print(f"[ERROR] Telegram send failed: {response.text}")
                return False
            
            if video_path and Path(video_path).exists():
                self._send_video(video_path, alert)
            
            print(f"[OK] Telegram alert sent for {alert['device_id']}")
            return True
            
        except Exception as e:
            print(f"[ERROR] Telegram error: {e}")
            return False
    
    def _format_alert_message(self, alert: dict) -> str:
        
        emoji_map = {
            'FIRE': '',
            'GAS_LEAK': '',
            'EXPLOSION': '',
            'INTRUDER': '',
            'ANOMALY': '[WARN]',
            'NORMAL': '[OK]'
        }
        
        severity_badge = {
            'CRITICAL': '[ALERT] CRITICAL',
            'HIGH': ' HIGH',
            'MEDIUM': '[WARN] MEDIUM',
            'LOW': '[Info] LOW'
        }
        
        alert_type = alert.get('alert_type', 'UNKNOWN')
        severity = alert.get('severity', 'UNKNOWN')
        device_id = alert.get('device_id', 'Unknown')
        ai_score = alert.get('ai_score', 0.0)
        timestamp = alert.get('timestamp', datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
        
        emoji = emoji_map.get(alert_type, '[WARN]')
        badge = severity_badge.get(severity, severity)
        
        message = f"""
{emoji} <b>SECURITY ALERT</b> {emoji}

<b>Type:</b> {alert_type}
<b>Severity:</b> {badge}
<b>Device:</b> {device_id}
<b>AI Score:</b> {ai_score}
<b>Time:</b> {timestamp}

{self._get_alert_description(alert_type)}
"""
        
        return message.strip()
    
    def _get_alert_description(self, alert_type: str) -> str:
        descriptions = {
            'FIRE': ' High temperature detected! Potential fire hazard.',
            'GAS_LEAK': ' Dangerous gas levels detected! Evacuate immediately.',
            'EXPLOSION': ' Loud noise detected! Possible explosion.',
            'INTRUDER': ' Motion detected! Unauthorized access suspected.',
            'ANOMALY': '[WARN] Unusual sensor pattern detected.',
            'NORMAL': '[OK] System operating normally.'
        }
        return descriptions.get(alert_type, 'Alert triggered.')
    
    def _send_video(self, video_path: str, alert: dict) -> bool:
        try:
            with open(video_path, 'rb') as video_file:
                files = {'video': video_file}
                data = {
                    'chat_id': self.chat_id,
                    'caption': f"[Camera] Video recording for {alert['alert_type']} alert"
                }
                
                response = requests.post(
                    f"{self.base_url}/sendVideo",
                    data=data,
                    files=files,
                    timeout=60
                )
                
                if response.status_code == 200:
                    print(f"[OK] Video sent: {video_path}")
                    return True
                else:
                    print(f"[ERROR] Video send failed: {response.text}")
                    return False
                    
        except Exception as e:
            print(f"[ERROR] Video send error: {e}")
            return False
    
    def send_photo(self, photo_path: str, caption: str = None) -> bool:
        if not self.enabled:
            return False
        
        try:
            with open(photo_path, 'rb') as photo_file:
                files = {'photo': photo_file}
                data = {
                    'chat_id': self.chat_id,
                    'caption': caption or 'Camera snapshot'
                }
                
                response = requests.post(
                    f"{self.base_url}/sendPhoto",
                    data=data,
                    files=files,
                    timeout=30
                )
                
                return response.status_code == 200
                
        except Exception as e:
            print(f"[ERROR] Photo send error: {e}")
            return False
    
    def send_test_message(self) -> bool:
        if not self.enabled:
            print("[ERROR] Telegram not configured")
            return False
        
        test_alert = {
            'device_id': 'System',
            'alert_type': 'NORMAL',
            'severity': 'LOW',
            'ai_score': 1.0,
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
        
        return self.send_alert(test_alert)

_notifier = None

def get_notifier() -> TelegramNotifier:
    global _notifier
    if _notifier is None:
        _notifier = TelegramNotifier()
    return _notifier

if __name__ == '__main__':
    print(" Testing Telegram Notifier")
    print("=" * 50)
    
    notifier = get_notifier()
    
    if notifier.enabled:
        print("[OK] Credentials found")
        print(" Sending test message...")
        
        if notifier.send_test_message():
            print("[OK] Test message sent successfully!")
        else:
            print("[ERROR] Test message failed")
    else:
        print("[ERROR] Not configured")
        print("\nTo enable Telegram notifications:")
        print("1. Create bot: https://t.me/BotFather")
        print("2. Get Chat ID: https://t.me/userinfobot")
        print("3. Add to .env:")
        print("   TELEGRAM_TOKEN=your_bot_token")
        print("   TELEGRAM_CHAT_ID=your_chat_id")
    
    print("=" * 50)
