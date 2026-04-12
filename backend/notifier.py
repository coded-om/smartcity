"""
Notifier - Telegram Alert System
==================================

Sends real-time alerts to Telegram when anomalies are detected.

Features:
- Instant push notifications
- Rich message formatting (emoji, severity badges)
- Photo attachments (camera snapshots)
- Video file sharing
- Alert summary reports

Setup:
1. Create Telegram Bot via @BotFather
2. Get your Chat ID from @userinfobot
3. Add credentials to .env file
"""

import requests
import os
from pathlib import Path
from datetime import datetime


class TelegramNotifier:
    """Telegram bot for sending security alerts"""
    
    def __init__(self, token: str = None, chat_id: str = None):
        """
        Initialize Telegram notifier.
        
        Args:
            token: Bot token from @BotFather
            chat_id: Your Telegram chat ID
        """
        self.token = token or os.getenv('TELEGRAM_TOKEN')
        self.chat_id = chat_id or os.getenv('TELEGRAM_CHAT_ID')
        
        if not self.token or not self.chat_id:
            print("⚠️  Telegram credentials not configured")
            print("   Add TELEGRAM_TOKEN and TELEGRAM_CHAT_ID to .env")
            self.enabled = False
        else:
            self.enabled = True
            self.base_url = f"https://api.telegram.org/bot{self.token}"
    
    def send_alert(self, alert: dict, video_path: str = None) -> bool:
        """
        Send alert notification to Telegram.
        
        Args:
            alert: Alert dict with keys: device_id, alert_type, severity, ai_score, timestamp
            video_path: Optional path to video file
        
        Returns:
            bool: True if sent successfully
        """
        if not self.enabled:
            return False
        
        try:
            # Format message
            message = self._format_alert_message(alert)
            
            # Send text message
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
                print(f"❌ Telegram send failed: {response.text}")
                return False
            
            # Send video if available
            if video_path and Path(video_path).exists():
                self._send_video(video_path, alert)
            
            print(f"✅ Telegram alert sent for {alert['device_id']}")
            return True
            
        except Exception as e:
            print(f"❌ Telegram error: {e}")
            return False
    
    def _format_alert_message(self, alert: dict) -> str:
        """Format alert as HTML message with emoji"""
        
        # Alert type emoji mapping
        emoji_map = {
            'FIRE': '🔥',
            'GAS_LEAK': '☣️',
            'EXPLOSION': '💥',
            'INTRUDER': '👤',
            'ANOMALY': '⚠️',
            'NORMAL': '✅'
        }
        
        # Severity badge
        severity_badge = {
            'CRITICAL': '🚨 CRITICAL',
            'HIGH': '⚡ HIGH',
            'MEDIUM': '⚠️ MEDIUM',
            'LOW': 'ℹ️ LOW'
        }
        
        alert_type = alert.get('alert_type', 'UNKNOWN')
        severity = alert.get('severity', 'UNKNOWN')
        device_id = alert.get('device_id', 'Unknown')
        ai_score = alert.get('ai_score', 0.0)
        timestamp = alert.get('timestamp', datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
        
        emoji = emoji_map.get(alert_type, '⚠️')
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
        """Get human-readable alert description"""
        descriptions = {
            'FIRE': '🔥 High temperature detected! Potential fire hazard.',
            'GAS_LEAK': '☣️ Dangerous gas levels detected! Evacuate immediately.',
            'EXPLOSION': '💥 Loud noise detected! Possible explosion.',
            'INTRUDER': '👤 Motion detected! Unauthorized access suspected.',
            'ANOMALY': '⚠️ Unusual sensor pattern detected.',
            'NORMAL': '✅ System operating normally.'
        }
        return descriptions.get(alert_type, 'Alert triggered.')
    
    def _send_video(self, video_path: str, alert: dict) -> bool:
        """Send video file to Telegram"""
        try:
            with open(video_path, 'rb') as video_file:
                files = {'video': video_file}
                data = {
                    'chat_id': self.chat_id,
                    'caption': f"📹 Video recording for {alert['alert_type']} alert"
                }
                
                response = requests.post(
                    f"{self.base_url}/sendVideo",
                    data=data,
                    files=files,
                    timeout=60
                )
                
                if response.status_code == 200:
                    print(f"✅ Video sent: {video_path}")
                    return True
                else:
                    print(f"❌ Video send failed: {response.text}")
                    return False
                    
        except Exception as e:
            print(f"❌ Video send error: {e}")
            return False
    
    def send_photo(self, photo_path: str, caption: str = None) -> bool:
        """Send photo to Telegram"""
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
            print(f"❌ Photo send error: {e}")
            return False
    
    def send_test_message(self) -> bool:
        """Send test message to verify configuration"""
        if not self.enabled:
            print("❌ Telegram not configured")
            return False
        
        test_alert = {
            'device_id': 'System',
            'alert_type': 'NORMAL',
            'severity': 'LOW',
            'ai_score': 1.0,
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
        
        return self.send_alert(test_alert)


# Singleton instance
_notifier = None

def get_notifier() -> TelegramNotifier:
    """Get global notifier instance"""
    global _notifier
    if _notifier is None:
        _notifier = TelegramNotifier()
    return _notifier


if __name__ == '__main__':
    # Test notifier
    print("🧪 Testing Telegram Notifier")
    print("=" * 50)
    
    notifier = get_notifier()
    
    if notifier.enabled:
        print("✅ Credentials found")
        print("📤 Sending test message...")
        
        if notifier.send_test_message():
            print("✅ Test message sent successfully!")
        else:
            print("❌ Test message failed")
    else:
        print("❌ Not configured")
        print("\nTo enable Telegram notifications:")
        print("1. Create bot: https://t.me/BotFather")
        print("2. Get Chat ID: https://t.me/userinfobot")
        print("3. Add to .env:")
        print("   TELEGRAM_TOKEN=your_bot_token")
        print("   TELEGRAM_CHAT_ID=your_chat_id")
    
    print("=" * 50)
