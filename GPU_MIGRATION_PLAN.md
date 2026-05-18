# GPU Migration Plan — Smart City AI Security System

## الوضع الحالي
- الجهاز: Linux (CPU فقط)
- YOLO: YOLOv8n (`yolov8n.pt` / `yolov8n.onnx`)
- inference: CPU، `imgsz=640`، `half=False`
- معالجة الـ frames: snapshot واحدة كل 5 ثوانٍ (ليس كل frame)
- Backend: Flask + SQLite + SocketIO

## الجهاز المستهدف
- GPU: NVIDIA RTX 4050 (Ada Lovelace)
- يدعم: CUDA، TensorRT FP16، FlashAttention

---

## التغييرات المطلوبة عند النقل للجهاز الجديد

### 1. تثبيت PyTorch مع CUDA
```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
```

### 2. تحديث `backend/object_detector.py`

**السطر ~136** — تفعيل FP16:
```python
# قبل (CPU):
half=False,       # FP32 for CPU (no CUDA)

# بعد (GPU):
half=True,        # FP16 for GPU
```

**اختياري — ترقية النموذج إلى YOLO12n** (أفضل على GPU):
```python
# في أعلى الملف:
PT_MODEL_NAME   = 'yolo12n.pt'   # كان yolov8n.pt
ONNX_MODEL_NAME = 'yolo12n.onnx' # كان yolov8n.onnx
```
- YOLO12n على RTX 4050 يستفيد من FlashAttention → أسرع + أدق من v8
- YOLO12n على CPU = أبطأ (لذلك لم نستخدمه على الجهاز الحالي)

**اختياري — تشغيل YOLO على كل frame بدل كل 5 ثوانٍ**:
- في `face_recognition_engine.py` → `start_face_recognition_loop()`
- غيّر `interval` من 5 إلى 1 أو 0.5

### 3. التحقق من CUDA
```python
import torch
print(torch.cuda.is_available())      # يجب أن يطبع True
print(torch.cuda.get_device_name(0))  # RTX 4050
```

### 4. تصدير ONNX للنموذج الجديد (اختياري لأقصى سرعة)
```bash
yolo export model=yolo12n.pt format=onnx imgsz=640
```

---

## مقارنة الأداء المتوقع

| الوضع | وقت inference | الملاحظة |
|---|---|---|
| CPU + YOLOv8n + imgsz=640 | ~150–300ms | الوضع الحالي |
| CPU + YOLOv8n + imgsz=320 | ~40–80ms | تحسين سريع بدون GPU |
| RTX 4050 + CUDA + YOLOv8n | ~5–10ms | 30–50x أسرع |
| RTX 4050 + TensorRT FP16 + YOLO12n | ~2–4ms | الأقصى |

---

## ما لا يحتاج تغيير
- Flask backend — يبقى كما هو
- SQLite — يبقى كما هو (ما في ضغط كافٍ يستدعي PostgreSQL)
- SocketIO — يبقى كما هو
- واجهة frontend React — لا تغيير
- MQTT handler — لا تغيير
- Face recognition engine — لا تغيير (مبني بالفعل بـ graceful degradation)

---

## ملاحظات مهمة
- YOLO12 مناسب للـ GPU فقط (attention blocks بطيئة على CPU)
- YOLO11n هو أفضل خيار لو بقيت على CPU (أدق من v8 بنفس السرعة)
- كود النظام مكتوب بـ `YOLO_MODEL_PATH` env variable → تقدر تغيير النموذج بدون تعديل كود
- ملف `.env` يُقرأ تلقائياً من `backend/config.py`
