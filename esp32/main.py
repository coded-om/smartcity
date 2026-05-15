from machine import Pin, ADC
import dht
import network
from umqtt.simple import MQTTClient
import ujson
import time

DEVICE_ID = "ESP32_1" 

WIFI_SSID = "Scan 2025"
WIFI_PASSWORD = "MoMo2025"

MQTT_BROKER = "192.168.0.134" 
MQTT_PORT = 1883
MQTT_TOPIC = b"esp32/sensors"

SAMPLE_INTERVAL = 2
dht_sensor = dht.DHT11(Pin(14))
gas_sensor = ADC(Pin(32))
gas_sensor.atten(ADC.ATTN_11DB)
mic_sensor = ADC(Pin(35))
mic_sensor.atten(ADC.ATTN_11DB)
pir_sensor = Pin(13, Pin.IN)
led_activity = Pin(27, Pin.OUT)
led_gas = Pin(26, Pin.OUT)
led_temp_humid = Pin(25, Pin.OUT)
led_alert = Pin(12, Pin.OUT)
led_wifi = led_activity

def connect_wifi():
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    
    if not wlan.isconnected():
        print(f'Connecting to {WIFI_SSID}...')
        wlan.connect(WIFI_SSID, WIFI_PASSWORD)
        
        timeout = 0
        while not wlan.isconnected() and timeout < 30:
            led_wifi.value(not led_wifi.value())
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

def connect_mqtt():
    try:
        client = MQTTClient(DEVICE_ID, MQTT_BROKER, port=MQTT_PORT)
        client.connect()
        led_temp_humid.on()
        print(f'MQTT connected to {MQTT_BROKER}:{MQTT_PORT}')
        return client
    except Exception as e:
        led_temp_humid.off()
        print(f'MQTT connection failed: {e}')
        return None

def read_sensors():
    try:
        dht_sensor.measure()
        temperature = dht_sensor.temperature()
        humidity = dht_sensor.humidity()
        gas = gas_sensor.read()
        mic = mic_sensor.read()
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

def check_local_alerts(data):
    if data['gas'] > 2100:
        led_gas.on()
    else:
        led_gas.off()
    if data['temperature'] > 35 or data['humidity'] > 70:
        led_temp_humid.on()
    else:
        led_temp_humid.off()
    if data['motion'] == 1:
        led_alert.on()
    else:
        led_alert.off()

    return data['gas'] > 2100 or data['temperature'] > 35 or data['humidity'] > 70 or data['motion'] == 1

def main():
    print("=" * 50)
    print(" ESP32 Smart Sensor System")
    print(f" Device ID: {DEVICE_ID}")
    print("=" * 50)
    for led in [led_activity, led_gas, led_temp_humid, led_alert]:
        led.on()
        time.sleep(0.2)
        led.off()
    if not connect_wifi():
        print(" Cannot start without WiFi")
        return
    mqtt_client = connect_mqtt()
    if not mqtt_client:
        print(" Cannot start without MQTT")
        return

    led_gas.off()
    led_temp_humid.off()
    
    print(" System ready - Starting monitoring...")
    print(f" Sampling every {SAMPLE_INTERVAL} seconds")
    print()
    reading_count = 0
    
    while True:
        try:
            led_activity.on()
            data = read_sensors()
            
            if data:
                is_alert = check_local_alerts(data)
                payload = ujson.dumps(data)
                mqtt_client.publish(MQTT_TOPIC, payload)
                
                reading_count += 1
                if reading_count % 10 == 0:
                    print(f" [{reading_count}] {data['temperature']}°C, " +
                          f"{data['humidity']}%, " +
                          f"Gas:{data['gas']}, " +
                          f"Mic:{data['mic']}, " +
                          f"Motion:{data['motion']}")
            
            led_activity.off()
            time.sleep(SAMPLE_INTERVAL)
        
        except OSError as e:
            print(f" MQTT error: {e}")
            led_temp_humid.off()
            print(" Reconnecting...")
            mqtt_client = connect_mqtt()
            if not mqtt_client:
                time.sleep(5)
        
        except KeyboardInterrupt:
            print("\n  Stopped by user")
            break
        
        except Exception as e:
            print(f" Error: {e}")
            time.sleep(5)
    try:
        mqtt_client.disconnect()
    except:
        pass
    
    for led in [led_activity, led_gas, led_temp_humid, led_alert]:
        led.off()
    
    print(" Goodbye!")

if __name__ == '__main__':
    main()
