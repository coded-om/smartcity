# Smart City AI Security System — وصف المشروع

## نظرة عامة

**Smart City AI Security System** هو منصة أمنية ذكية متكاملة تجمع بين إنترنت الأشياء (IoT) والذكاء الاصطناعي لمراقبة البيئات الحضرية في الوقت الفعلي. يعتمد النظام على أجهزة استشعار ESP32 وكاميرات IP لاكتشاف التهديدات الأمنية والتنبيه الفوري عبر لوحة تحكم ويب تفاعلية.

---

## المكونات الرئيسية

```
ESP32 Sensors  ──MQTT──►  Flask Backend  ──►  SQLite DB
                               │
                    ┌──────────┼──────────┐
                    ▼          ▼          ▼
               AI Engine   Recorder   Notifier
             (Isolation   (RTSP/FFmpeg) (Telegram)
               Forest)
                    │
                    ▼
            React Frontend (Dashboard)
```

---

## الوحدات والطبقات

### 1. جهاز الاستشعار — ESP32 (`esp32/`)
- **اللغة:** MicroPython
- **الحساسات المدعومة:**
  - DHT11 — درجة الحرارة والرطوبة (Pin 14)
  - MQ-2 — استشعار الغاز (Pin 32 ADC)
  - Microphone — مستوى الصوت (Pin 35 ADC)
  - PIR — كشف الحركة (Pin 13)
  - 4 مؤشرات LED (Pins 26, 25, 12, 27)
- **الوظيفة:** يرسل القراءات كل ثانيتين عبر بروتوكول MQTT إلى الخادم الخلفي

---

### 2. الخادم الخلفي — Flask (`backend/`)

| الملف | الوظيفة |
|---|---|
| `app.py` | نقطة دخول التطبيق، تسجيل المسارات، تهيئة SocketIO |
| `ai_engine.py` | محرك الذكاء الاصطناعي — Isolation Forest لكشف الشذوذ |
| `mqtt_handler.py` | استقبال بيانات المستشعرات عبر MQTT |
| `object_detector.py` | كشف الكائنات بنموذج YOLOv8 |
| `face_recognition_engine.py` | التعرف على الوجوه |
| `threat_detector.py` | تصنيف التهديدات الأمنية |
| `recorder.py` | تسجيل مقاطع فيديو RTSP عبر FFmpeg |
| `notifier.py` | إرسال تنبيهات Telegram |
| `db.py` | طبقة قاعدة البيانات SQLite |
| `config.py` | إعدادات البيئة من ملف `.env` |
| `state.py` | الحالة المشتركة بين الوحدات |
| `calibrate_thresholds.py` | معايرة عتبات الكشف |

#### مسارات API (`routes/`)

| المسار | الوصف |
|---|---|
| `/api/sensors` | بيانات المستشعرات والقراءات |
| `/api/cameras` | إدارة الكاميرات والبث |
| `/api/persons` | قاعدة بيانات الأشخاص والتعرف على الوجوه |
| `/api/analytics` | التحليلات والإحصاءات |

---

### 3. الواجهة الأمامية — React (`frontend/`)

لوحة تحكم ويب حديثة مبنية بـ **React** + **Tailwind CSS** + **Socket.IO** للتحديثات الفورية.

#### الصفحات والمكونات

| المكون | الوظيفة |
|---|---|
| `Overview.js` | لوحة الملخص العامة — أعداد التنبيهات والأجهزة والكاميرات |
| `LiveMonitor.js` | مراقبة البث المباشر للكاميرات |
| `ThreatMonitor.js` | مراقبة التهديدات في الوقت الفعلي |
| `Cameras.js` | إدارة الكاميرات وعرض حالتها |
| `CameraModal.js` | تفاصيل الكاميرا، تشخيصات RTSP، لقطات الشاشة |
| `ForensicLogs.js` | سجلات الطب الجنائي والأحداث الأمنية |
| `AIAnalysis.js` | عرض نتائج تحليل الذكاء الاصطناعي |
| `SecurityMap.js` | خريطة توزيع الأجهزة والكاميرات |
| `ReportCenter.js` | مركز التقارير وتصدير البيانات |
| `Settings.js` | إعدادات النظام |
| `Header.js` + `Sidebar.js` | التنقل الرئيسي |

---

## الميزات الرئيسية

### كشف التهديدات بالذكاء الاصطناعي
- نموذج **Isolation Forest** لكشف الشذوذ في بيانات المستشعرات
- تصنيف التهديدات: `FIRE` | `GAS_LEAK` | `EXPLOSION` | `INTRUDER` | `NORMAL`
- مستويات الخطورة: `CRITICAL` | `HIGH` | `MEDIUM` | `LOW`
- نقاط الذكاء الاصطناعي (ai_score): قيم سالبة = شذوذ، موجبة = طبيعي

### كاميرات وتسجيل
- دعم بروتوكول **RTSP** عبر FFmpeg وOpenCV
- تسجيل مقاطع فيديو (30 ثانية) عند اكتشاف التهديدات
- تشخيصات الاتصال: اتصال RTSP، لقطة، بث، زمن الاستجابة
- تنظيف تلقائي للتسجيلات القديمة

### كشف الكائنات والوجوه
- كشف الكائنات بنموذج **YOLOv8n** (ONNX + PyTorch)
- التعرف على الوجوه لتحديد الهوية

### الإشعارات
- **Telegram Bot**: تنبيهات فورية مع مرفقات الفيديو وأيقونات الخطورة

### البيانات والتحليلات
- قاعدة بيانات **SQLite** لتخزين جميع القراءات والتنبيهات
- إحصاءات مباشرة عبر API REST
- تحديثات فورية عبر **WebSocket (Socket.IO)**

---

## المتطلبات التقنية

| المكون | الإصدار |
|---|---|
| Python | 3.10+ |
| Node.js | 18+ |
| FFmpeg | آخر إصدار |
| MQTT Broker | Mosquitto (localhost:1883) |
| OS | Linux (موصى به) |

### مكتبات Python الرئيسية
- `flask`, `flask-socketio`, `flask-cors`
- `scikit-learn` — نماذج الذكاء الاصطناعي
- `opencv-python` — معالجة الفيديو
- `ultralytics` — YOLOv8
- `paho-mqtt` — بروتوكول MQTT
- `APScheduler` — المهام المجدولة

---

## التشغيل السريع

```bash
# 1. تشغيل الخادم الخلفي
cd ~/Desktop/smartcity
./run_backend.sh

# 2. تشغيل الواجهة الأمامية
cd frontend
npm install && npm start

# 3. اختبار إرسال بيانات مستشعر
mosquitto_pub -h localhost -t esp32/sensors -m '{
  "device": "ESP32_Factory01",
  "temperature": 25,
  "humidity": 60,
  "gas": 300,
  "mic": 200,
  "motion": 0
}'
```

- **لوحة التحكم:** `http://localhost:3000`
- **API الخلفي:** `http://localhost:5000`

---

## متغيرات البيئة (`.env`)

```env
TELEGRAM_TOKEN=<token_from_botfather>
TELEGRAM_CHAT_ID=<your_chat_id>
CAMERA_ESP32_Factory01=rtsp://user:pass@ip:554/stream
```

---

## هيكل قاعدة البيانات

- **readings** — قراءات المستشعرات الخام
- **alerts** — التنبيهات الأمنية المكتشفة
- **devices** — الأجهزة المسجلة
- **cameras** — الكاميرات وإعداداتها
- **persons** — بيانات الأشخاص المعرّفين

---

## مراحل التطوير المكتملة

| المرحلة | الوصف | الحالة |
|---|---|---|
| Phase 1 | البنية التحتية الخلفية — Flask API + SQLite | ✅ مكتمل |
| Phase 2 | محرك الذكاء الاصطناعي — Isolation Forest | ✅ مكتمل |
| Phase 3 | الكاميرات والإشعارات — RTSP + Telegram | ✅ مكتمل |
| Phase 4 | ترقية الواجهة الأمامية — React Dashboard | ✅ مكتمل |
| Phase 5 | برنامج ESP32 — MicroPython Firmware | ✅ مكتمل |
| Phase 6 | تقارير PDF | 🔄 جاهز للتنفيذ |
