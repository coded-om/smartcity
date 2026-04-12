"""
ESP32 Smart Sensor Firmware
============================

Multi-sensor IoT device with AI-ready data collection.

Hardware:
- ESP32 DevKit
- DHT11 - Temperature & Humidity (Pin 14)
- MQ-2 - Gas Sensor (Pin 32 ADC)
- Microphone Module (Pin 35 ADC)
- PIR Motion Sensor (Pin 13)
- LED Indicators (Pins 26, 25, 12, 27)

Features:
- 5 sensors in one device
- WiFi MQTT publishing
- LED status indicators
- 2-second sampling rate
- Auto-reconnect
- Low power modes

Setup:
1. Install MicroPython on ESP32
2. Configure WiFi credentials
3. Update DEVICE_ID
4. Upload via Thonny or ampy
"""

from machine import Pin, ADC
import dht
import network
from umqtt.simple import MQTTClient
import ujson
import time

# ═══════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════

DEVICE_ID = "ESP32_Factory01"  # Change for each device

WIFI_SSID = "YourWiFiNetwork"
WIFI_PASSWORD = "YourWiFiPassword"

MQTT_BROKER = "192.168.1.10"  # Raspberry Pi IP
MQTT_PORT = 1883
MQTT_TOPIC = b"esp32/sensors"

SAMPLE_INTERVAL = 2  # seconds

# ═══════════════════════════════════════════════════════════════
# Hardware Setup
# ═══════════════════════════════════════════════════════════════

# DHT11 - Temperature & Humidity
dht_sensor = dht.DHT11(Pin(14))

# MQ-2 Gas Sensor (ADC)
gas_sensor = ADC(Pin(32))
gas_sensor.atten(ADC.ATTN_11DB)  # 0-3.3V range

# Microphone (ADC)
mic_sensor = ADC(Pin(35))
mic_sensor.atten(ADC.ATTN_11DB)

# PIR Motion Sensor
pir_sensor = Pin(13, Pin.IN)

# LED Indicators
led_wifi = Pin(26, Pin.OUT)      # Blue - WiFi Status
led_mqtt = Pin(25, Pin.OUT)      # Green - MQTT Status
led_alert = Pin(12, Pin.OUT)     # Red - Alert Status
led_activity = Pin(27, Pin.OUT)  # Yellow - Activity

# ═══════════════════════════════════════════════════════════════
# WiFi Connection
# ═══════════════════════════════════════════════════════════════

def connect_wifi():
    """Connect to WiFi network"""
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    
    if not wlan.isconnected():
        print(f'Connecting to {WIFI_SSID}...')
        wlan.connect(WIFI_SSID, WIFI_PASSWORD)
        
        timeout = 0
        while not wlan.isconnected() and timeout < 30:
            led_wifi.value(not led_wifi.value())  # Blink
            time.sleep(0.5)
            timeout += 0.5
    
    if wlan.isconnected():
        led_wifi.on()
        print('WiFi connected:', wlan.ifconfig()[0])
        return True
    else:
        led_wifi.off()
        print('WiFi connection failed')
        return False

# ═══════════════════════════════════════════════════════════════
# MQTT Connection
# ═══════════════════════════════════════════════════════════════

def connect_mqtt():
    """Connect to MQTT broker"""
    try:
        client = MQTTClient(DEVICE_ID, MQTT_BROKER, port=MQTT_PORT)
        client.connect()
        led_mqtt.on()
        print(f'MQTT connected to {MQTT_BROKER}:{MQTT_PORT}')
        return client
    except Exception as e:
        led_mqtt.off()
        print(f'MQTT connection failed: {e}')
        return None

# ═══════════════════════════════════════════════════════════════
# Sensor Reading
# ═══════════════════════════════════════════════════════════════

def read_sensors():
    """Read all sensor values"""
    try:
        # DHT11 Temperature & Humidity
        dht_sensor.measure()
        temperature = dht_sensor.temperature()
        humidity = dht_sensor.humidity()
        
        # Gas Sensor (0-4095 ADC value)
        gas = gas_sensor.read()
        
        # Microphone (0-4095 ADC value)
        mic = mic_sensor.read()
        
        # PIR Motion (0 or 1)
        motion = pir_sensor.value()
        
        return {
            "device": DEVICE_ID,
            "temperature": temperature,
            "humidity": humidity,
            "gas": gas,
            "mic": mic,
            "motion": motion
        }
    
    except Exception as e:
        print(f'Sensor read error: {e}')
        return None

# ═══════════════════════════════════════════════════════════════
# Alert Detection (Local)
# ═══════════════════════════════════════════════════════════════

def check_local_alerts(data):
    """
    Check for critical thresholds locally.
    Provides immediate LED feedback before cloud processing.
    """
    alert = False
    
    # Fire detection
    if data['temperature'] > 55:
        led_alert.on()
        alert = True
        print('⚠️  LOCAL ALERT: High temperature!')
    
    # Gas leak detection
    elif data['gas'] > 3000:
        led_alert.on()
        alert = True
        print('⚠️  LOCAL ALERT: Gas detected!')
    
    # Loud noise detection
    elif data['mic'] > 3500:
        led_alert.on()
        alert = True
        print('⚠️  LOCAL ALERT: Loud noise!')
    
    # Intruder detection
    elif data['motion'] == 1:
        led_alert.on()
        alert = True
        print('⚠️  LOCAL ALERT: Motion detected!')
    
    if not alert:
        led_alert.off()
    
    return alert

# ═══════════════════════════════════════════════════════════════
# Main Loop
# ═══════════════════════════════════════════════════════════════

def main():
    """Main program loop"""
    print("=" * 50)
    print("🚀 ESP32 Smart Sensor System")
    print(f"📡 Device ID: {DEVICE_ID}")
    print("=" * 50)
    
    # Initial LED test
    for led in [led_wifi, led_mqtt, led_alert, led_activity]:
        led.on()
        time.sleep(0.2)
        led.off()
    
    # Connect to WiFi
    if not connect_wifi():
        print("❌ Cannot start without WiFi")
        return
    
    # Connect to MQTT
    mqtt_client = connect_mqtt()
    if not mqtt_client:
        print("❌ Cannot start without MQTT")
        return
    
    print("✅ System ready - Starting monitoring...")
    print(f"📊 Sampling every {SAMPLE_INTERVAL} seconds")
    print()
    
    # Main monitoring loop
    reading_count = 0
    
    while True:
        try:
            # Activity LED blink
            led_activity.on()
            
            # Read sensors
            data = read_sensors()
            
            if data:
                # Check for local alerts
                is_alert = check_local_alerts(data)
                
                # Publish to MQTT
                payload = ujson.dumps(data)
                mqtt_client.publish(MQTT_TOPIC, payload)
                
                reading_count += 1
                
                # Print status every 10 readings
                if reading_count % 10 == 0:
                    print(f"📊 [{reading_count}] {data['temperature']}°C, " +
                          f"{data['humidity']}%, " +
                          f"Gas:{data['gas']}, " +
                          f"Mic:{data['mic']}, " +
                          f"Motion:{data['motion']}")
            
            led_activity.off()
            
            # Wait for next sample
            time.sleep(SAMPLE_INTERVAL)
        
        except OSError as e:
            # MQTT connection lost
            print(f"❌ MQTT error: {e}")
            led_mqtt.off()
            print("🔄 Reconnecting...")
            mqtt_client = connect_mqtt()
            if not mqtt_client:
                time.sleep(5)
        
        except KeyboardInterrupt:
            print("\n⏹️  Stopped by user")
            break
        
        except Exception as e:
            print(f"❌ Error: {e}")
            time.sleep(5)
    
    # Cleanup
    try:
        mqtt_client.disconnect()
    except:
        pass
    
    for led in [led_wifi, led_mqtt, led_alert, led_activity]:
        led.off()
    
    print("👋 Goodbye!")

# ═══════════════════════════════════════════════════════════════
# Entry Point
# ═══════════════════════════════════════════════════════════════

if __name__ == '__main__':
    main()
