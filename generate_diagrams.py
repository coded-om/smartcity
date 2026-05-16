"""
Diagram generator for Smart City AI Security System Final Report.
Produces PNG files in ./diagrams/ folder.
"""
import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import matplotlib.patheffects as pe
import numpy as np

OUT = 'diagrams'
os.makedirs(OUT, exist_ok=True)

DPI = 150
DARK_BG   = '#1E2530'
BLUE      = '#0070C0'
BLUE_LT   = '#C6DFEF'
GREEN     = '#2ECC71'
ORANGE    = '#E67E22'
RED       = '#E74C3C'
PURPLE    = '#9B59B6'
TEAL      = '#1ABC9C'
GRAY      = '#7F8C8D'
WHITE     = '#FFFFFF'
DARK_TEXT = '#1A1A2E'

def save(fig, name):
    path = f'{OUT}/{name}.png'
    fig.savefig(path, dpi=DPI, bbox_inches='tight', facecolor=fig.get_facecolor())
    plt.close(fig)
    print(f'  Saved: {name}.png')
    return path

def box(ax, x, y, w, h, label, sublabel='', color=BLUE, text_color=WHITE, fontsize=9, radius=0.3):
    rect = FancyBboxPatch((x - w/2, y - h/2), w, h,
                          boxstyle=f'round,pad=0.05,rounding_size={radius}',
                          facecolor=color, edgecolor=WHITE, linewidth=1.2, zorder=3)
    ax.add_patch(rect)
    if sublabel:
        ax.text(x, y + h*0.12, label, ha='center', va='center',
                fontsize=fontsize, fontweight='bold', color=text_color, zorder=4)
        ax.text(x, y - h*0.22, sublabel, ha='center', va='center',
                fontsize=fontsize-2, color=text_color, alpha=0.85, zorder=4)
    else:
        ax.text(x, y, label, ha='center', va='center',
                fontsize=fontsize, fontweight='bold', color=text_color, zorder=4)

def arrow(ax, x1, y1, x2, y2, label='', color=WHITE, lw=1.5):
    ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle='->', color=color,
                                lw=lw, connectionstyle='arc3,rad=0.0'),
                zorder=5)
    if label:
        mx, my = (x1+x2)/2, (y1+y2)/2
        ax.text(mx, my, label, ha='center', va='center',
                fontsize=7, color=color, zorder=6,
                bbox=dict(facecolor=DARK_BG, edgecolor='none', pad=1.5))

def darrow(ax, x1, y1, x2, y2, label='', color=WHITE, lw=1.5):
    ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle='<->', color=color,
                                lw=lw, connectionstyle='arc3,rad=0.0'),
                zorder=5)
    if label:
        mx, my = (x1+x2)/2, (y1+y2)/2
        ax.text(mx, my, label, ha='center', va='center',
                fontsize=7, color=color, zorder=6,
                bbox=dict(facecolor=DARK_BG, edgecolor='none', pad=1.5))


# ════════════════════════════════════════════════════════════════
# FIGURE 1 – SYSTEM ARCHITECTURE
# ════════════════════════════════════════════════════════════════
print("Generating Figure 1 – System Architecture...")
fig, ax = plt.subplots(figsize=(14, 8))
fig.patch.set_facecolor(DARK_BG)
ax.set_facecolor(DARK_BG)
ax.set_xlim(0, 14); ax.set_ylim(0, 8)
ax.axis('off')
ax.set_title('Smart City AI Security System – Architecture Overview',
             fontsize=14, fontweight='bold', color=WHITE, pad=14)

# Layer backgrounds
for (x0,y0,w,h,lbl,col) in [
    (0.1, 5.8, 3.2, 1.8, 'IoT Edge Layer', '#0D2137'),
    (4.0, 0.4, 5.8, 7.4, 'Application Layer (Flask Backend)', '#0A1929'),
    (10.2, 2.8, 3.5, 4.8, 'Presentation Layer (React)', '#0A2910'),
    (0.1, 0.4, 3.2, 5.0, 'Data Sources', '#1A0D2E'),
]:
    rect = mpatches.FancyBboxPatch((x0,y0), w, h,
        boxstyle='round,pad=0.1', facecolor=col, edgecolor=GRAY,
        linewidth=0.8, linestyle='--', zorder=1)
    ax.add_patch(rect)
    ax.text(x0+0.15, y0+h-0.2, lbl, fontsize=7, color=GRAY, zorder=2, style='italic')

# ESP32 devices
box(ax, 1.7, 7.0, 2.6, 0.7, 'ESP32 Device 1', 'Sensors: DHT11, MQ-2, PIR, Mic', PURPLE)
box(ax, 1.7, 5.9, 2.6, 0.7, 'ESP32 Device 2', 'Sensors: DHT11, MQ-2, PIR, Mic', PURPLE)

# MQTT Broker
box(ax, 1.7, 4.7, 2.6, 0.7, 'MQTT Broker', 'Mosquitto :1883', TEAL)

# RTSP Cameras
box(ax, 1.7, 3.5, 2.6, 0.7, 'RTSP IP Camera(s)', 'H.264 Stream', ORANGE)

# FFmpeg
box(ax, 1.7, 2.3, 2.6, 0.7, 'FFmpeg', 'Video Recording', GRAY)

# SQLite DB
box(ax, 1.7, 1.1, 2.6, 0.7, 'SQLite Database', 'WAL mode, 7 tables', RED)

# Flask Backend boxes
box(ax, 6.9, 7.0, 3.8, 0.7, 'mqtt_handler.py', 'MQTT Subscribe → Parse → Persist', BLUE)
box(ax, 6.9, 5.9, 3.8, 0.7, 'ai_engine.py', 'Isolation Forest | Rule Classify', BLUE)
box(ax, 5.3, 4.7, 2.2, 0.7, 'recorder.py', 'RTSP → MP4', ORANGE)
box(ax, 7.6, 4.7, 2.2, 0.7, 'object_detector', 'YOLOv8n', GREEN)
box(ax, 9.9, 4.7, 2.2, 0.7, 'face_recog.py', '128-D Encodings', TEAL)
box(ax, 5.3, 3.5, 2.2, 0.7, 'threat_detector', 'Optical Flow', PURPLE)
box(ax, 7.6, 3.5, 2.2, 0.7, 'notifier.py', 'Telegram Bot', RED)
box(ax, 9.9, 3.5, 2.2, 0.7, 'socketio.py', 'WebSocket', GREEN)
box(ax, 6.9, 2.2, 3.8, 0.7, 'REST API Blueprints', 'sensors | cameras | persons | analytics', BLUE)
box(ax, 6.9, 1.1, 3.8, 0.7, 'Flask App (app.py)', 'Factory + Thread Orchestration | Port 5000', '#003566')

# React Dashboard
box(ax, 11.9, 6.4, 2.8, 0.7, 'React Dashboard', 'Overview + LiveMonitor', GREEN)
box(ax, 11.9, 5.3, 2.8, 0.7, 'Cameras + ThreatMonitor', 'MJPEG + Socket.IO', GREEN)
box(ax, 11.9, 4.2, 2.8, 0.7, 'ForensicLogs + Reports', 'CSV / PDF Export', GREEN)
box(ax, 11.9, 3.1, 2.8, 0.7, 'SecurityMap + Settings', 'Leaflet + Config', GREEN)

# Telegram
box(ax, 11.9, 1.1, 2.8, 0.7, 'Telegram Bot', 'CRITICAL / HIGH Alerts', RED)

# Arrows – ESP32 → MQTT
arrow(ax, 3.0, 7.0, 4.0, 7.0, 'MQTT\npublish', PURPLE)
arrow(ax, 3.0, 5.9, 4.0, 6.8, '', PURPLE)

# MQTT → mqtt_handler
arrow(ax, 4.0, 7.0, 5.0, 7.0, '', TEAL)

# mqtt_handler → ai_engine
arrow(ax, 6.9, 6.65, 6.9, 6.25, 'predict()', WHITE)

# ai_engine → recorder/detector/FR
arrow(ax, 5.5, 6.65, 5.3, 5.1, '', ORANGE)
arrow(ax, 6.9, 6.65, 7.6, 5.1, '', GREEN)
arrow(ax, 8.3, 6.65, 9.9, 5.1, '', TEAL)

# Camera → object_detector/threat/FR
arrow(ax, 3.0, 3.5, 5.0, 4.7, 'RTSP', ORANGE)

# Recorder ← FFmpeg
arrow(ax, 3.0, 2.3, 4.2, 4.9, '', GRAY)

# notifier → Telegram
arrow(ax, 8.7, 3.5, 11.5, 1.5, '', RED)

# socketio → React
arrow(ax, 9.9, 3.5, 10.5, 6.4, 'WS', GREEN)
arrow(ax, 9.9, 3.5, 10.5, 5.3, '', GREEN)

# REST API → React
arrow(ax, 8.8, 2.55, 10.5, 4.2, 'HTTP/REST', BLUE_LT)

# DB ← mqtt_handler
arrow(ax, 3.0, 1.1, 5.0, 1.1, 'SQLite', RED)

save(fig, 'fig1_architecture')


# ════════════════════════════════════════════════════════════════
# FIGURE 2 – GANTT CHART
# ════════════════════════════════════════════════════════════════
print("Generating Figure 2 – Gantt Chart...")
tasks = [
    ('Documentation & Report',      3.5, 4.0),
    ('Bug Fixes + Optimisation',     3.5, 4.0),
    ('Integration Testing',          3.5, 4.0),
    ('React Dashboard (8 pages)',    2.5, 4.0),
    ('Face Recognition Engine',      2.5, 3.5),
    ('Camera + YOLOv8',              2.5, 4.0),
    ('Telegram + Recording',         1.5, 2.5),
    ('MQTT + AI Engine',             1.5, 3.0),
    ('DB & Backend Design',          1.5, 3.0),
    ('Feasibility & Tech Selection', 1.0, 2.0),
    ('Planning & Requirements',      1.0, 2.0),
]
phases = [
    (0, 4, 'Phase 4: Testing & Docs',  '#2C3E50'),
    (0, 3, 'Phase 3: Frontend+Camera', '#1A3A5C'),
    (0, 2, 'Phase 2: Backend+AI',      '#0A2030'),
    (0, 1, 'Phase 1: Planning',        '#0D1B2A'),
]
colors = [BLUE, TEAL, GREEN, ORANGE, PURPLE, RED, TEAL, BLUE, GREEN, ORANGE, PURPLE]

fig, ax = plt.subplots(figsize=(12, 6))
fig.patch.set_facecolor(DARK_BG)
ax.set_facecolor(DARK_BG)
ax.set_title('Project Gantt Chart – Smart City AI Security System',
             fontsize=13, fontweight='bold', color=WHITE, pad=12)

yticks = list(range(len(tasks)))
for i, (task, start, end) in enumerate(tasks):
    ax.barh(i, end - start, left=start, height=0.55,
            color=colors[i % len(colors)], edgecolor='white', linewidth=0.5)
    ax.text(start + 0.08, i, task, va='center', ha='left',
            fontsize=8, color=WHITE, fontweight='bold')

ax.set_yticks(yticks)
ax.set_yticklabels([''] * len(tasks))
ax.set_xlim(1, 4.4)
ax.set_xticks([1, 1.5, 2, 2.5, 3, 3.5, 4])
ax.set_xticklabels(['Start', 'Month 1\nEnd', 'Month 2\nEnd', 'Month 2.5', 'Month 3\nEnd', 'Month 3.5', 'Month 4\nEnd'],
                   color=WHITE, fontsize=8)
ax.tick_params(colors=WHITE)
for spine in ax.spines.values():
    spine.set_edgecolor(GRAY)
ax.grid(axis='x', color=GRAY, linestyle='--', linewidth=0.5, alpha=0.5)
ax.axvline(x=2, color=ORANGE, linestyle='--', linewidth=1, alpha=0.7, label='Month 2')
ax.axvline(x=3, color=GREEN,  linestyle='--', linewidth=1, alpha=0.7, label='Month 3')
ax.legend(facecolor='#2C3E50', labelcolor=WHITE, fontsize=8, loc='lower right')

save(fig, 'fig2_gantt')


# ════════════════════════════════════════════════════════════════
# FIGURE 3 – ER DIAGRAM
# ════════════════════════════════════════════════════════════════
print("Generating Figure 3 – ER Diagram...")
fig, ax = plt.subplots(figsize=(16, 10))
fig.patch.set_facecolor(DARK_BG)
ax.set_facecolor(DARK_BG)
ax.set_xlim(0, 16); ax.set_ylim(0, 10)
ax.axis('off')
ax.set_title('Entity-Relationship (ER) Diagram', fontsize=14, fontweight='bold', color=WHITE, pad=12)

def er_entity(ax, x, y, name, attrs, pk=None, fks=None, color=BLUE, w=3.0):
    fks = fks or []
    all_attrs = attrs
    h_header = 0.55
    h_row = 0.38
    total_h = h_header + len(all_attrs) * h_row + 0.15
    # Header
    rect_h = FancyBboxPatch((x, y), w, h_header,
        boxstyle='round,pad=0.05', facecolor=color, edgecolor=WHITE, linewidth=1.2, zorder=3)
    ax.add_patch(rect_h)
    ax.text(x + w/2, y + h_header/2, name, ha='center', va='center',
            fontsize=9, fontweight='bold', color=WHITE, zorder=4)
    # Body
    rect_b = FancyBboxPatch((x, y - (total_h - h_header)), w, total_h - h_header,
        boxstyle='round,pad=0.05', facecolor='#1A2535', edgecolor=WHITE, linewidth=1.2, zorder=3)
    ax.add_patch(rect_b)
    for i, attr in enumerate(all_attrs):
        ay = y - h_header - (i + 0.5) * h_row
        prefix = ''
        col = WHITE
        if pk and attr == pk:
            prefix = 'PK  '; col = '#FFD700'
        elif attr in fks:
            prefix = 'FK  '; col = '#90EE90'
        ax.text(x + 0.15, ay, prefix + attr, ha='left', va='center',
                fontsize=7.5, color=col, zorder=4)
    return total_h

# readings
er_entity(ax, 0.2, 9.7, 'readings', ['id (PK)', 'device_id (FK)', 'timestamp', 'temperature', 'humidity', 'gas', 'mic', 'motion', 'ai_score', 'alert_type'],
          pk='id (PK)', fks=['device_id (FK)'], color=BLUE, w=2.8)

# alerts
er_entity(ax, 3.5, 9.7, 'alerts', ['id (PK)', 'device_id (FK)', 'timestamp', 'alert_type', 'severity', 'ai_score', 'video_file', 'resolved', 'notes'],
          pk='id (PK)', fks=['device_id (FK)'], color=RED, w=2.8)

# devices
er_entity(ax, 6.8, 9.7, 'devices', ['device_id (PK)', 'location', 'lat', 'lng', 'model_path', 'trained_at', 'last_seen', 'status'],
          pk='device_id (PK)', color=TEAL, w=2.8)

# cameras
er_entity(ax, 0.2, 4.2, 'cameras', ['id (PK)', 'name', 'rtsp_url', 'type', 'device_id (FK)', 'location', 'lat', 'lng', 'enabled', 'face_recognition_enabled', 'recording_enabled'],
          pk='id (PK)', fks=['device_id (FK)'], color=ORANGE, w=2.8)

# persons
er_entity(ax, 3.5, 4.2, 'persons', ['id (PK)', 'name', 'employee_id (UQ)', 'role', 'department', 'photo_path', 'face_encoding_path', 'cloud_subject', 'authorized', 'notes'],
          pk='id (PK)', color=PURPLE, w=2.8)

# face_detections
er_entity(ax, 6.8, 4.2, 'face_detections', ['id (PK)', 'camera_id (FK)', 'person_id (FK)', 'confidence', 'snapshot_path', 'bbox_json', 'frame_width', 'frame_height', 'analysis_method', 'face_count', 'timestamp'],
          pk='id (PK)', fks=['camera_id (FK)', 'person_id (FK)'], color=GREEN, w=2.8)

# object_detections
er_entity(ax, 10.1, 4.2, 'object_detections', ['id (PK)', 'camera_id (FK)', 'class_name', 'confidence', 'bbox_json', 'frame_width', 'frame_height', 'snapshot_path', 'timestamp'],
          pk='id (PK)', fks=['camera_id (FK)'], color='#E056A0', w=2.8)

# Relationship lines
ax.annotate('', xy=(1.6, 9.7-1.0), xytext=(7.2, 9.7-0.55),
            arrowprops=dict(arrowstyle='-', color=GRAY, lw=1.5), zorder=2)
ax.text(4.3, 9.0, 'device_id', fontsize=7, color=GRAY, ha='center')

ax.annotate('', xy=(4.9, 9.7-1.0), xytext=(7.2, 9.7-0.55),
            arrowprops=dict(arrowstyle='-', color=GRAY, lw=1.5), zorder=2)

ax.annotate('', xy=(1.6, 4.2-0.55), xytext=(7.2, 9.7-4.0),
            arrowprops=dict(arrowstyle='-', color=GRAY, lw=1.5), zorder=2)

ax.annotate('', xy=(8.2, 4.2-0.0), xytext=(1.6, 4.2-2.5),
            arrowprops=dict(arrowstyle='->', color=ORANGE, lw=1.5), zorder=2)
ax.text(4.4, 3.15, 'camera_id → cameras.id', fontsize=7, color=ORANGE, ha='center')

ax.annotate('', xy=(8.2, 4.2-0.55), xytext=(5.0, 4.2-2.5),
            arrowprops=dict(arrowstyle='->', color=PURPLE, lw=1.5), zorder=2)
ax.text(7.0, 2.5, 'person_id → persons.id', fontsize=7, color=PURPLE, ha='center')

ax.annotate('', xy=(11.5, 4.2-0.0), xytext=(1.6, 4.2-2.5),
            arrowprops=dict(arrowstyle='->', color='#E056A0', lw=1.5), zorder=2)
ax.text(7.5, 1.7, 'camera_id → cameras.id', fontsize=7, color='#E056A0', ha='center')

# Legend
for lbl, col in [('Primary Key (PK)', '#FFD700'), ('Foreign Key (FK)', '#90EE90'), ('Relationship', GRAY)]:
    ax.plot([], [], color=col, lw=2, label=lbl)
ax.legend(facecolor='#1A2535', labelcolor=WHITE, fontsize=8, loc='lower right',
          framealpha=0.9)

save(fig, 'fig3_er_diagram')


# ════════════════════════════════════════════════════════════════
# FIGURE 4 – USE CASE DIAGRAM
# ════════════════════════════════════════════════════════════════
print("Generating Figure 4 – Use Case Diagram...")
fig, ax = plt.subplots(figsize=(14, 10))
fig.patch.set_facecolor(DARK_BG)
ax.set_facecolor(DARK_BG)
ax.set_xlim(0, 14); ax.set_ylim(0, 10)
ax.axis('off')
ax.set_title('Use Case Diagram – Smart City AI Security System', fontsize=13, fontweight='bold', color=WHITE, pad=12)

def stick_figure(ax, x, y, label, color=WHITE):
    ax.add_patch(plt.Circle((x, y+0.6), 0.22, color=color, zorder=4))
    ax.plot([x, x], [y+0.38, y-0.2], color=color, lw=1.5, zorder=4)
    ax.plot([x-0.35, x+0.35], [y+0.1, y+0.1], color=color, lw=1.5, zorder=4)
    ax.plot([x, x-0.3], [y-0.2, y-0.7], color=color, lw=1.5, zorder=4)
    ax.plot([x, x+0.3], [y-0.2, y-0.7], color=color, lw=1.5, zorder=4)
    ax.text(x, y-0.95, label, ha='center', va='top', fontsize=8, color=color,
            fontweight='bold', zorder=4)

def use_case(ax, x, y, text, color=BLUE, w=2.4, h=0.55):
    ell = mpatches.Ellipse((x, y), w, h, facecolor=color, edgecolor=WHITE,
                            linewidth=1.2, zorder=3)
    ax.add_patch(ell)
    ax.text(x, y, text, ha='center', va='center', fontsize=7.5,
            color=WHITE, fontweight='bold', zorder=4, wrap=True,
            multialignment='center')

def uc_line(ax, ax1, ay1, ax2, ay2):
    ax.plot([ax1, ax2], [ay1, ay2], color=GRAY, lw=1, zorder=2)

# System boundary
rect_sys = FancyBboxPatch((3.5, 0.3), 9.5, 9.2,
    boxstyle='round,pad=0.1', facecolor='#0A1929', edgecolor=BLUE_LT,
    linewidth=1.5, linestyle='--', zorder=1)
ax.add_patch(rect_sys)
ax.text(8.25, 9.35, 'Smart City AI Security System', ha='center', va='bottom',
        fontsize=9, color=BLUE_LT, style='italic')

# Actors
stick_figure(ax, 1.2, 8.5, 'ESP32\nDevice', PURPLE)
stick_figure(ax, 1.2, 5.5, 'Security\nOperator', TEAL)
stick_figure(ax, 1.2, 2.5, 'System\nAdministrator', ORANGE)
stick_figure(ax, 13.2, 5.5, 'Telegram\nBot', RED)

# Use cases – column 1 (IoT)
use_case(ax, 6.0, 8.8, 'Publish Sensor\nData (MQTT)', PURPLE)
use_case(ax, 6.0, 7.7, 'Receive &\nParse Data', BLUE)
use_case(ax, 6.0, 6.6, 'Run AI Anomaly\nDetection', BLUE)
use_case(ax, 6.0, 5.5, 'Classify &\nRate Alert', BLUE)
use_case(ax, 6.0, 4.4, 'Record Video\nEvidence', ORANGE)
use_case(ax, 6.0, 3.3, 'Send Telegram\nAlert', RED)
use_case(ax, 6.0, 2.2, 'Store Alert\nin Database', TEAL)
use_case(ax, 6.0, 1.1, 'Push WebSocket\nEvent', GREEN)

# Use cases – column 2 (operator/admin)
use_case(ax, 10.0, 8.8, 'View Live\nDashboard', GREEN)
use_case(ax, 10.0, 7.7, 'Monitor Camera\nStreams', GREEN)
use_case(ax, 10.0, 6.6, 'View Face\nDetections', TEAL)
use_case(ax, 10.0, 5.5, 'Resolve Alert\n+ Add Notes', TEAL)
use_case(ax, 10.0, 4.4, 'Export\nReport (CSV/PDF)', TEAL)
use_case(ax, 10.0, 3.3, 'Manage\nCameras', ORANGE)
use_case(ax, 10.0, 2.2, 'Enrol Person\n(Face ID)', PURPLE)
use_case(ax, 10.0, 1.1, 'Train AI\nModel', BLUE)

# Actor connections
for uy in [8.8, 7.7, 6.6, 5.5, 4.4, 3.3, 2.2, 1.1]:
    uc_line(ax, 1.7, 8.5 if uy >= 6.6 else (5.5 if uy >= 3.3 else 2.5), 3.8, uy)
for uy in [8.8, 7.7, 6.6, 5.5, 4.4]:
    uc_line(ax, 2.2, 5.5, 8.8, uy)
for uy in [3.3, 2.2, 1.1]:
    uc_line(ax, 2.2, 2.5, 8.8, uy)
uc_line(ax, 13.0, 5.5, 11.2, 3.3)

save(fig, 'fig4_usecase')


# ════════════════════════════════════════════════════════════════
# FIGURE 5 – CLASS DIAGRAM
# ════════════════════════════════════════════════════════════════
print("Generating Figure 5 – Class Diagram...")
fig, ax = plt.subplots(figsize=(18, 11))
fig.patch.set_facecolor(DARK_BG)
ax.set_facecolor(DARK_BG)
ax.set_xlim(0, 18); ax.set_ylim(0, 11)
ax.axis('off')
ax.set_title('Class Diagram – Backend Modules', fontsize=14, fontweight='bold', color=WHITE, pad=12)

def class_box(ax, x, y, name, attrs, methods, color=BLUE, w=3.5):
    h_name = 0.5
    h_row  = 0.32
    n_lines = len(attrs) + len(methods) + (1 if attrs and methods else 0)
    total_h = h_name + n_lines * h_row + 0.15

    # Name bar
    ax.add_patch(FancyBboxPatch((x, y - h_name), w, h_name,
        boxstyle='round,pad=0.05', facecolor=color, edgecolor=WHITE, lw=1.2, zorder=3))
    ax.text(x + w/2, y - h_name/2, name, ha='center', va='center',
            fontsize=8.5, fontweight='bold', color=WHITE, zorder=4)

    # Body
    body_h = total_h - h_name
    ax.add_patch(FancyBboxPatch((x, y - total_h), w, body_h,
        boxstyle='round,pad=0.05', facecolor='#1A2535', edgecolor=WHITE, lw=1.2, zorder=3))

    row = 0
    for a in attrs:
        ay = y - h_name - (row + 0.5) * h_row
        ax.text(x + 0.15, ay, '– ' + a, ha='left', va='center',
                fontsize=7, color=BLUE_LT, zorder=4)
        row += 1
    if attrs and methods:
        sep_y = y - h_name - row * h_row
        ax.plot([x + 0.1, x + w - 0.1], [sep_y, sep_y], color=GRAY, lw=0.8, zorder=4)
        row += 0.3
    for m in methods:
        ay = y - h_name - (row + 0.5) * h_row
        ax.text(x + 0.15, ay, '+ ' + m, ha='left', va='center',
                fontsize=7, color='#90EE90', zorder=4)
        row += 1
    return x + w/2, y, x + w/2, y - total_h   # cx_top, cy_top, cx_bot, cy_bot

def cl(ax, x1, y1, x2, y2, style='->', label=''):
    ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle=style, color=GRAY, lw=1.2,
                                connectionstyle='arc3,rad=0.0'), zorder=2)
    if label:
        ax.text((x1+x2)/2 + 0.1, (y1+y2)/2, label,
                fontsize=6.5, color=GRAY, ha='left', zorder=5)

# FlaskApp
class_box(ax, 0.3, 10.5, 'FlaskApp\n(app.py)',
    ['port: int', 'socketio: SocketIO'],
    ['register_blueprints()', 'start_mqtt_thread()', 'start_fr_loops()', 'warmup_yolo()'],
    '#003566', w=3.4)

# AIEngine
class_box(ax, 4.5, 10.5, 'AIEngine\n(ai_engine.py)',
    ['model_cache: dict', 'MIN_SAMPLES: int = 100', 'N_ESTIMATORS: int = 100'],
    ['train_model(device_id)', 'predict(device_id, reading)', '_rule_classify(readings)', 'get_severity(type, score)', 'analyze_security_events()'],
    BLUE, w=3.4)

# MQTTHandler
class_box(ax, 8.7, 10.5, 'MQTTHandler\n(mqtt_handler.py)',
    ['client: MQTTClient', 'latest_readings: dict'],
    ['mqtt_thread()', 'on_message(client, ud, msg)', '_run_ai(device_id, reading)', '_persist(device_id, data, ai)'],
    TEAL, w=3.4)

# Database
class_box(ax, 13.0, 10.5, 'Database\n(db.py)',
    ['DB_PATH: str', 'WAL_MODE: bool'],
    ['init_db()', 'get_db()', 'serialize_alert(row)', 'migrate()'],
    RED, w=3.4)

# ObjectDetector
class_box(ax, 0.3, 6.0, 'ObjectDetector\n(object_detector.py)',
    ['model: YOLO', 'target_classes: set', 'conf_threshold: float = 0.35'],
    ['warmup()', 'detect_objects(frame_path)', '_get_model()', '_ensure_onnx()'],
    GREEN, w=3.4)

# ThreatDetector
class_box(ax, 4.5, 6.0, 'ThreatDetector\n(threat_detector.py)',
    ['prev_frames: dict', 'BEHAVIOUR_EVERY_N: int = 3'],
    ['analyze_frame(cam_id, frame, weapons)', '_analyse_flow(prev, curr)', '_corners(frame)'],
    ORANGE, w=3.4)

# FaceRecognitionEngine
class_box(ax, 8.7, 6.0, 'FaceRecognitionEngine\n(face_recognition_engine.py)',
    ['known_encodings: list', 'MATCH_THRESHOLD: float = 0.6', 'mode: str'],
    ['register_person(name, photo)', 'process_camera_frame(frame)', 'match_face(encoding)', '_luxand_enroll()'],
    PURPLE, w=3.6)

# Recorder
class_box(ax, 0.3, 2.2, 'Recorder\n(recorder.py)',
    ['cameras: dict', 'PREVIEW_WIDTH: int'],
    ['record_alert(device_id, type)', 'record_snapshot(url)', 'mjpeg_stream(device_id)', '_record_worker(url, path)'],
    GRAY, w=3.4)

# Notifier
class_box(ax, 4.5, 2.2, 'Notifier\n(notifier.py)',
    ['token: str', 'chat_id: str'],
    ['send_alert(device_id, type, sev)', 'send_text(message)', 'send_video(path, caption)'],
    '#C0392B', w=3.4)

# StateManager
class_box(ax, 8.7, 2.2, 'StateManager\n(state.py)',
    ['latest_readings: dict', '_recording_ts: dict', '_anomaly_ts: dict'],
    ['can_record(device_id, now)', 'can_alert(device_id, type, now)'],
    '#6C3483', w=3.4)

# SocketIO
class_box(ax, 13.0, 2.2, 'SocketIO\n(socketio_instance.py)',
    ['socketio: SocketIO'],
    ['emit(event, data)', 'on_connect()', 'on_disconnect()'],
    '#27AE60', w=3.4)

# Relationships
cl(ax, 2.0, 9.1, 5.5, 9.0, '->', 'uses')
cl(ax, 5.5, 9.1, 7.5, 9.0, '->', 'calls predict()')
cl(ax, 10.4, 9.1, 14.7, 9.0, '->', 'reads/writes')
cl(ax, 2.0, 9.0, 2.0, 3.5, '->', 'spawns')
cl(ax, 6.2, 9.0, 6.2, 3.5, '->', 'calls')
cl(ax, 10.4, 9.0, 9.0, 3.5, '->', 'calls')
cl(ax, 14.7, 9.0, 15.0, 3.5, '->', 'emits')

save(fig, 'fig5_class_diagram')


# ════════════════════════════════════════════════════════════════
# FIGURE 6 – SEQUENCE DIAGRAM
# ════════════════════════════════════════════════════════════════
print("Generating Figure 6 – Sequence Diagram...")
fig, ax = plt.subplots(figsize=(16, 10))
fig.patch.set_facecolor(DARK_BG)
ax.set_facecolor(DARK_BG)
ax.set_xlim(0, 16); ax.set_ylim(0, 10)
ax.axis('off')
ax.set_title('Sequence Diagram – Alert Pipeline (MQTT to Dashboard)', fontsize=13, fontweight='bold', color=WHITE, pad=12)

participants = [
    ('ESP32',          1.0,  PURPLE),
    ('MQTT Broker',    2.8,  TEAL),
    ('mqtt_handler',   4.8,  BLUE),
    ('ai_engine',      6.6,  BLUE),
    ('Database',       8.4,  RED),
    ('state.py',       10.0, '#6C3483'),
    ('recorder',       11.4, GRAY),
    ('notifier',       12.8, '#C0392B'),
    ('socketio',       14.2, GREEN),
]
YSTART = 9.3
YEND   = 0.3

for name, x, col in participants:
    box(ax, x, YSTART, 1.3, 0.48, name, color=col, fontsize=7.5)
    ax.plot([x, x], [YSTART - 0.24, YEND], color=col, lw=1,
            linestyle='--', alpha=0.5, zorder=1)

def seq_msg(ax, from_x, to_x, y, label, col=WHITE, ret=False, dashed=False):
    style = '<-' if ret else '->'
    ls = '--' if dashed or ret else '-'
    ax.annotate('', xy=(to_x, y), xytext=(from_x, y),
                arrowprops=dict(arrowstyle=style, color=col, lw=1.3,
                                linestyle=ls,
                                connectionstyle='arc3,rad=0.0'), zorder=5)
    mid = (from_x + to_x) / 2
    ax.text(mid, y + 0.1, label, ha='center', va='bottom',
            fontsize=7, color=col, zorder=6)

def act_box(ax, x, y_top, height, color):
    ax.add_patch(FancyBboxPatch((x - 0.12, y_top - height), 0.24, height,
        boxstyle='square,pad=0.0', facecolor=color, edgecolor='none', alpha=0.8, zorder=3))

step_y = [8.5, 7.9, 7.3, 6.7, 6.1, 5.5, 4.9, 4.3, 3.8, 3.2, 2.7, 2.2, 1.7, 1.2]
labels = [
    (1.0, 2.8, 'publish JSON (esp32/sensors)', PURPLE, False),
    (2.8, 4.8, 'on_message callback', TEAL, False),
    (4.8, 6.6, 'predict(device_id, reading)', BLUE, False),
    (6.6, 8.4, 'SELECT last readings', BLUE, False),
    (8.4, 6.6, 'return rows', RED, True),
    (6.6, 4.8, 'return (score, type, severity)', BLUE, True),
    (4.8, 10.0, 'can_alert() / can_record()', '#6C3483', False),
    (4.8, 8.4,  'INSERT readings', TEAL, False),
    (4.8, 8.4,  'INSERT alert',    TEAL, False),
    (4.8, 11.4, 'record_alert() [async]', GRAY, False),
    (4.8, 12.8, 'send_alert() [async]', '#C0392B', False),
    (4.8, 14.2, 'emit(new_alert)', GREEN, False),
    (14.2, 4.8, 'WebSocket push', GREEN, True),
]
for i, (fx, tx, lbl, col, ret) in enumerate(labels):
    if i < len(step_y):
        seq_msg(ax, fx, tx, step_y[i], lbl, col, ret)

# Step numbers
for i, y in enumerate(step_y[:len(labels)]):
    ax.text(0.1, y, f'{i+1}', fontsize=7, color=GRAY, va='center')

save(fig, 'fig6_sequence')


# ════════════════════════════════════════════════════════════════
# FIGURE 7 – ACTIVITY DIAGRAM
# ════════════════════════════════════════════════════════════════
print("Generating Figure 7 – Activity Diagram...")
fig, ax = plt.subplots(figsize=(10, 18))
fig.patch.set_facecolor(DARK_BG)
ax.set_facecolor(DARK_BG)
ax.set_xlim(0, 10); ax.set_ylim(0, 18)
ax.axis('off')
ax.set_title('Activity Diagram – Alert Lifecycle', fontsize=13, fontweight='bold', color=WHITE, pad=12)

def act(ax, x, y, text, color=BLUE, w=4.0, h=0.55):
    rect = FancyBboxPatch((x - w/2, y - h/2), w, h,
        boxstyle='round,pad=0.15', facecolor=color, edgecolor=WHITE, lw=1.2, zorder=3)
    ax.add_patch(rect)
    ax.text(x, y, text, ha='center', va='center',
            fontsize=8, fontweight='bold', color=WHITE, zorder=4)

def decision(ax, x, y, text, size=0.55):
    diamond = plt.Polygon([[x, y+size], [x+size*1.8, y], [x, y-size], [x-size*1.8, y]],
                           facecolor='#F39C12', edgecolor=WHITE, lw=1.2, zorder=3)
    ax.add_patch(diamond)
    ax.text(x, y, text, ha='center', va='center', fontsize=7.5, fontweight='bold',
            color=WHITE, zorder=4)

def down_arrow(ax, x, y, length=0.5, label=''):
    ax.annotate('', xy=(x, y - length), xytext=(x, y),
                arrowprops=dict(arrowstyle='->', color=WHITE, lw=1.3), zorder=5)
    if label:
        ax.text(x + 0.15, y - length/2, label, fontsize=7, color=WHITE, va='center')

def fork_bar(ax, x, y, w=3.0):
    ax.add_patch(mpatches.Rectangle((x - w/2, y - 0.07), w, 0.14,
                 facecolor=WHITE, edgecolor='none', zorder=3))

# Start
ax.add_patch(plt.Circle((5, 17.4), 0.22, color=WHITE, zorder=4))
down_arrow(ax, 5, 17.18, 0.4)

act(ax, 5, 16.4, 'Sensor Reading Received via MQTT')
down_arrow(ax, 5, 16.12)
act(ax, 5, 15.5, 'Parse JSON Payload', color=TEAL)
down_arrow(ax, 5, 15.22)
decision(ax, 5, 14.5, 'Hard threshold\ntriggered?')

ax.text(6.9, 14.5, 'YES', fontsize=7.5, color=WHITE, va='center')
ax.annotate('', xy=(7.5, 14.5), xytext=(5.9, 14.5),
            arrowprops=dict(arrowstyle='->', color=WHITE, lw=1.2), zorder=5)
act(ax, 8.3, 14.5, 'Set alert_type\n(FIRE/GAS_LEAK/\nEXPLOSION/INTRUDER)', ORANGE, w=3.0, h=0.9)

ax.text(4.6, 13.9, 'NO', fontsize=7.5, color=WHITE, va='center')
down_arrow(ax, 5, 13.95, 0.4)

decision(ax, 5, 13.2, 'AI Model\navailable?')
ax.text(6.9, 13.2, 'NO', fontsize=7.5, color=WHITE, va='center')
ax.annotate('', xy=(7.5, 13.2), xytext=(5.9, 13.2),
            arrowprops=dict(arrowstyle='->', color=WHITE, lw=1.2), zorder=5)
act(ax, 8.3, 13.2, 'Set type =\nTRAINING', GRAY, w=2.0, h=0.55)

ax.text(4.6, 12.65, 'YES', fontsize=7.5, color=WHITE, va='center')
down_arrow(ax, 5, 12.7, 0.4)

act(ax, 5, 11.95, 'Run Isolation Forest\npredict(device_id, features)', BLUE, h=0.75)
down_arrow(ax, 5, 11.57)

decision(ax, 5, 10.8, 'Anomaly\ndetected?')
ax.text(6.9, 10.8, 'YES', fontsize=7.5, color=WHITE, va='center')
ax.annotate('', xy=(7.5, 10.8), xytext=(5.9, 10.8),
            arrowprops=dict(arrowstyle='->', color=WHITE, lw=1.2), zorder=5)
act(ax, 8.3, 10.8, 'Set type =\nANOMALY', RED, w=2.0, h=0.55)

ax.text(4.5, 10.25, 'NO → Set type = NORMAL', fontsize=7, color=WHITE, va='center')
down_arrow(ax, 5, 10.25, 0.5)

# Merge flow
act(ax, 5, 9.35, 'Calculate Severity\n(LOW/MEDIUM/HIGH/CRITICAL)', BLUE, h=0.65)
down_arrow(ax, 5, 9.02)

decision(ax, 5, 8.25, 'severity ≠ None\nAND cooldown OK?')
ax.text(6.9, 8.25, 'NO', fontsize=7.5, color=WHITE, va='center')
ax.annotate('', xy=(7.5, 8.25), xytext=(5.9, 8.25),
            arrowprops=dict(arrowstyle='->', color=WHITE, lw=1.2), zorder=5)
act(ax, 8.3, 8.25, 'Store Reading\nOnly', GRAY, w=2.0, h=0.55)

ax.text(4.5, 7.7, 'YES', fontsize=7.5, color=WHITE, va='center')
down_arrow(ax, 5, 7.7, 0.4)

# Fork
fork_bar(ax, 5, 7.0, w=5.5)
ax.annotate('', xy=(2.8, 6.4), xytext=(2.8, 7.0),
            arrowprops=dict(arrowstyle='->', color=WHITE, lw=1.2), zorder=5)
ax.annotate('', xy=(5.0, 6.4), xytext=(5.0, 7.0),
            arrowprops=dict(arrowstyle='->', color=WHITE, lw=1.2), zorder=5)
ax.annotate('', xy=(7.2, 6.4), xytext=(7.2, 7.0),
            arrowprops=dict(arrowstyle='->', color=WHITE, lw=1.2), zorder=5)

act(ax, 2.8, 5.95, 'Record Video\n(FFmpeg)', ORANGE, w=2.5, h=0.65)
act(ax, 5.0, 5.95, 'Store Alert\nin SQLite', RED, w=2.5, h=0.65)
act(ax, 7.2, 5.95, 'Send Telegram\nNotification', '#C0392B', w=2.5, h=0.65)

# Join
fork_bar(ax, 5, 5.3, w=5.5)
ax.plot([2.8, 2.8], [5.62, 5.3], color=WHITE, lw=1.2)
ax.plot([5.0, 5.0], [5.62, 5.3], color=WHITE, lw=1.2)
ax.plot([7.2, 7.2], [5.62, 5.3], color=WHITE, lw=1.2)
down_arrow(ax, 5, 5.3, 0.45)

act(ax, 5, 4.5, 'Emit WebSocket Event\n(socketio.emit)', GREEN, h=0.65)
down_arrow(ax, 5, 4.17)
act(ax, 5, 3.6, 'React Dashboard Updates', '#27AE60')
down_arrow(ax, 5, 3.32)
act(ax, 5, 2.75, 'Operator Reviews Alert', TEAL)
down_arrow(ax, 5, 2.47)
decision(ax, 5, 1.7, 'Resolved?')

ax.text(6.9, 1.7, 'NO: remain open', fontsize=7, color=GRAY, va='center')
ax.text(4.5, 1.15, 'YES', fontsize=7.5, color=WHITE, va='center')
down_arrow(ax, 5, 1.15, 0.45)

act(ax, 5, 0.45, 'Mark Resolved + Notes', GRAY)

# End
ax.add_patch(plt.Circle((5, 0.1), 0.15, color=WHITE, zorder=4))
ax.add_patch(plt.Circle((5, 0.1), 0.22, color='none', ec=WHITE, lw=2, zorder=5))

save(fig, 'fig7_activity')


# ════════════════════════════════════════════════════════════════
# FIGURE 14 – CLIENT/SERVER DIAGRAM
# ════════════════════════════════════════════════════════════════
print("Generating Figure 14 – Client/Server Diagram...")
fig, ax = plt.subplots(figsize=(14, 7))
fig.patch.set_facecolor(DARK_BG)
ax.set_facecolor(DARK_BG)
ax.set_xlim(0, 14); ax.set_ylim(0, 7)
ax.axis('off')
ax.set_title('Client/Server Communication Architecture', fontsize=13, fontweight='bold', color=WHITE, pad=12)

# Tiers
for (x0, y0, w, h, lbl, col) in [
    (0.1, 0.3, 3.0, 6.2, 'IoT Edge Layer', '#0D1B2E'),
    (3.5, 0.3, 6.8, 6.2, 'Application Server (Flask :5000)', '#0A1929'),
    (10.7, 2.0, 3.0, 3.2, 'Presentation Layer\n(React :3000)', '#0A2910'),
]:
    r = mpatches.FancyBboxPatch((x0, y0), w, h,
        boxstyle='round,pad=0.1', facecolor=col, edgecolor=GRAY,
        linewidth=0.8, linestyle='--', zorder=1)
    ax.add_patch(r)
    ax.text(x0+0.15, y0+h-0.3, lbl, fontsize=7.5, color=GRAY, zorder=2, style='italic')

# IoT layer
box(ax, 1.6, 5.8, 2.4, 0.55, 'ESP32 Device 1', '', PURPLE)
box(ax, 1.6, 5.0, 2.4, 0.55, 'ESP32 Device 2', '', PURPLE)
box(ax, 1.6, 4.0, 2.4, 0.55, 'MQTT Broker', ':1883', TEAL)
box(ax, 1.6, 3.0, 2.4, 0.55, 'RTSP Camera', ':554', ORANGE)
box(ax, 1.6, 2.0, 2.4, 0.55, 'FFmpeg Process', 'subprocess', GRAY)

# Flask internals
box(ax, 6.8, 5.8, 5.8, 0.55, 'API Blueprints (sensors|cameras|persons|analytics)', '', '#003580')
box(ax, 5.5, 4.8, 2.5, 0.55, 'mqtt_handler', 'MQTT Subscribe', TEAL)
box(ax, 8.5, 4.8, 2.5, 0.55, 'ai_engine', 'Isolation Forest', BLUE)
box(ax, 5.5, 3.7, 2.5, 0.55, 'recorder', 'FFmpeg calls', GRAY)
box(ax, 8.5, 3.7, 2.5, 0.55, 'object_detector', 'YOLOv8n', GREEN)
box(ax, 5.5, 2.6, 2.5, 0.55, 'face_recog', 'dlib 128-D', PURPLE)
box(ax, 8.5, 2.6, 2.5, 0.55, 'notifier', 'Telegram API', RED)
box(ax, 6.8, 1.5, 2.5, 0.55, 'SQLite DB', 'sensors.db', RED)
box(ax, 9.5, 1.5, 2.5, 0.55, 'SocketIO', 'WebSocket', GREEN)

# React
box(ax, 12.2, 4.8, 2.4, 0.55, 'React App', 'SPA', '#27AE60')
box(ax, 12.2, 3.7, 2.4, 0.55, 'Axios Client', 'HTTP Fetch', '#27AE60')
box(ax, 12.2, 2.6, 2.4, 0.55, 'Socket.IO\nClient', 'WS events', GREEN)

# Arrows
darrow(ax, 2.8, 5.8, 3.8, 5.0, 'MQTT publish', PURPLE)
darrow(ax, 2.8, 4.0, 3.8, 4.8, 'subscribe', TEAL)
arrow(ax, 2.8, 3.0, 3.8, 3.7, 'RTSP', ORANGE)
arrow(ax, 2.8, 2.0, 3.8, 3.7, 'spawn', GRAY)

darrow(ax, 10.0, 5.8, 11.0, 4.8, 'HTTP REST', BLUE_LT)
darrow(ax, 10.5, 4.8, 11.0, 3.7, 'JSON API', BLUE_LT)
darrow(ax, 10.5, 1.5, 11.0, 2.6, 'WebSocket', GREEN)

ax.text(3.5, 6.4, 'MQTT\n(port 1883)', fontsize=7.5, color=TEAL, ha='center',
        bbox=dict(facecolor=DARK_BG, edgecolor='none'))
ax.text(11.2, 5.4, 'HTTP/1.1\nJSON', fontsize=7.5, color=BLUE_LT, ha='center')
ax.text(11.2, 2.0, 'WebSocket\n(Socket.IO)', fontsize=7.5, color=GREEN, ha='center')

save(fig, 'fig14_client_server')

print("\nAll diagrams generated successfully.")
print(f"Location: {OUT}/")
