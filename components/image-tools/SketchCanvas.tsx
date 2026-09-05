'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

export type SketchCanvasTool = 'select' | 'pencil' | 'rectangle' | 'circle' | 'text';

export type SketchCanvasHandle = {
  clear: () => void;
  deleteSelected: () => void;
  getCanvasData: () => string;
  addImage: (dataUrl: string) => void;
  undo: () => void;
  redo: () => void;
  duplicate: () => void;
  bringForward: () => void;
  sendBackwards: () => void;
};

type Point = { x: number; y: number };

type SketchObject =
  | { id: string; type: 'path'; color: string; size: number; points: Point[] }
  | { id: string; type: 'rectangle'; color: string; size: number; x: number; y: number; width: number; height: number }
  | { id: string; type: 'circle'; color: string; size: number; x: number; y: number; radius: number }
  | { id: string; type: 'text'; color: string; x: number; y: number; text: string; fontSize: number }
  | { id: string; type: 'image'; x: number; y: number; width: number; height: number; dataUrl: string };

const BASE_WIDTH = 1600;
const BASE_HEIGHT = 900;

function makeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cloneObjects(objects: SketchObject[]) {
  return JSON.parse(JSON.stringify(objects)) as SketchObject[];
}

function getBounds(object: SketchObject) {
  if (object.type === 'path') {
    const xs = object.points.map((point) => point.x);
    const ys = object.points.map((point) => point.y);
    return {
      x: Math.min(...xs) - object.size,
      y: Math.min(...ys) - object.size,
      width: Math.max(...xs) - Math.min(...xs) + object.size * 2,
      height: Math.max(...ys) - Math.min(...ys) + object.size * 2
    };
  }

  if (object.type === 'circle') {
    return { x: object.x - object.radius, y: object.y - object.radius, width: object.radius * 2, height: object.radius * 2 };
  }

  if (object.type === 'text') {
    return { x: object.x, y: object.y - object.fontSize, width: Math.max(80, object.text.length * object.fontSize * 0.58), height: object.fontSize * 1.3 };
  }

  return { x: object.x, y: object.y, width: object.width, height: object.height };
}

function isInside(point: Point, object: SketchObject) {
  const bounds = getBounds(object);
  return point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height;
}

function moveObject(object: SketchObject, dx: number, dy: number): SketchObject {
  if (object.type === 'path') return { ...object, points: object.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) };
  if (object.type === 'circle') return { ...object, x: object.x + dx, y: object.y + dy };
  return { ...object, x: object.x + dx, y: object.y + dy };
}

export const SketchCanvas = forwardRef<SketchCanvasHandle, {
  tool: SketchCanvasTool;
  color: string;
  brushSize: number;
  textValue: string;
  onContentChange?: (isEmpty: boolean) => void;
}>(({ tool, color, brushSize, textValue, onContentChange }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const objectsRef = useRef<SketchObject[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  const drawingObjectIdRef = useRef<string | null>(null);
  const drawStartRef = useRef<Point | null>(null);
  const dragStateRef = useRef<{ id: string; last: Point } | null>(null);
  const historyRef = useRef<string[]>(['[]']);
  const redoRef = useRef<string[]>([]);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const syncEmpty = () => onContentChange?.(objectsRef.current.length === 0);

  function pushHistory() {
    const state = JSON.stringify(objectsRef.current);
    if (historyRef.current[historyRef.current.length - 1] !== state) {
      historyRef.current.push(state);
      if (historyRef.current.length > 60) historyRef.current.shift();
      redoRef.current = [];
    }
    syncEmpty();
  }

  function setSelected(nextId: string | null) {
    selectedIdRef.current = nextId;
    setSelectedId(nextId);
  }

  function getPointer(event: PointerEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * BASE_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * BASE_HEIGHT
    };
  }

  function draw() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    context.clearRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
    const gradient = context.createLinearGradient(0, 0, BASE_WIDTH, BASE_HEIGHT);
    gradient.addColorStop(0, '#111827');
    gradient.addColorStop(0.56, '#22144b');
    gradient.addColorStop(1, '#0f172a');
    context.fillStyle = gradient;
    context.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

    context.save();
    context.globalAlpha = 0.12;
    context.strokeStyle = '#ffffff';
    context.lineWidth = 1;
    for (let x = 0; x <= BASE_WIDTH; x += 80) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, BASE_HEIGHT);
      context.stroke();
    }
    for (let y = 0; y <= BASE_HEIGHT; y += 80) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(BASE_WIDTH, y);
      context.stroke();
    }
    context.restore();

    objectsRef.current.forEach((object) => {
      context.save();
      context.lineCap = 'round';
      context.lineJoin = 'round';

      if (object.type === 'path') {
        context.strokeStyle = object.color;
        context.lineWidth = object.size;
        context.beginPath();
        object.points.forEach((point, index) => {
          if (index === 0) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        });
        context.stroke();
      }

      if (object.type === 'rectangle') {
        context.strokeStyle = object.color;
        context.lineWidth = object.size;
        context.strokeRect(object.x, object.y, object.width, object.height);
      }

      if (object.type === 'circle') {
        context.strokeStyle = object.color;
        context.lineWidth = object.size;
        context.beginPath();
        context.arc(object.x, object.y, object.radius, 0, Math.PI * 2);
        context.stroke();
      }

      if (object.type === 'text') {
        context.fillStyle = object.color;
        context.font = `800 ${object.fontSize}px Inter, Arial, sans-serif`;
        context.fillText(object.text, object.x, object.y);
      }

      if (object.type === 'image') {
        const cached = imageCacheRef.current.get(object.dataUrl);
        if (cached?.complete) {
          context.drawImage(cached, object.x, object.y, object.width, object.height);
        } else {
          const image = cached || new Image();
          image.onload = draw;
          image.src = object.dataUrl;
          imageCacheRef.current.set(object.dataUrl, image);
          context.fillStyle = 'rgba(255,255,255,0.16)';
          context.fillRect(object.x, object.y, object.width, object.height);
        }
      }

      if (object.id === selectedIdRef.current) {
        const bounds = getBounds(object);
        context.strokeStyle = '#60a5fa';
        context.lineWidth = 4;
        context.setLineDash([14, 10]);
        context.strokeRect(bounds.x - 10, bounds.y - 10, bounds.width + 20, bounds.height + 20);
      }

      context.restore();
    });
  }

  useImperativeHandle(ref, () => ({
    clear() {
      objectsRef.current = [];
      setSelected(null);
      pushHistory();
      draw();
    },
    deleteSelected() {
      if (!selectedIdRef.current) return;
      objectsRef.current = objectsRef.current.filter((object) => object.id !== selectedIdRef.current);
      setSelected(null);
      pushHistory();
      draw();
    },
    getCanvasData() {
      const previous = selectedIdRef.current;
      selectedIdRef.current = null;
      draw();
      const data = canvasRef.current?.toDataURL('image/png') || '';
      selectedIdRef.current = previous;
      draw();
      return data;
    },
    addImage(dataUrl: string) {
      const image = new Image();
      image.onload = () => {
        const maxWidth = 920;
        const maxHeight = 520;
        const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
        const width = image.width * scale;
        const height = image.height * scale;
        const object: SketchObject = {
          id: makeId(),
          type: 'image',
          dataUrl,
          x: (BASE_WIDTH - width) / 2,
          y: (BASE_HEIGHT - height) / 2,
          width,
          height
        };
        objectsRef.current = [...objectsRef.current, object];
        setSelected(object.id);
        pushHistory();
        draw();
      };
      image.src = dataUrl;
    },
    undo() {
      if (historyRef.current.length <= 1) return;
      redoRef.current.push(historyRef.current.pop() || '[]');
      objectsRef.current = JSON.parse(historyRef.current[historyRef.current.length - 1] || '[]') as SketchObject[];
      setSelected(null);
      syncEmpty();
      draw();
    },
    redo() {
      const state = redoRef.current.pop();
      if (!state) return;
      historyRef.current.push(state);
      objectsRef.current = JSON.parse(state) as SketchObject[];
      setSelected(null);
      syncEmpty();
      draw();
    },
    duplicate() {
      const object = objectsRef.current.find((item) => item.id === selectedIdRef.current);
      if (!object) return;
      const copy = moveObject({ ...cloneObjects([object])[0], id: makeId() }, 44, 44);
      objectsRef.current = [...objectsRef.current, copy];
      setSelected(copy.id);
      pushHistory();
      draw();
    },
    bringForward() {
      const index = objectsRef.current.findIndex((item) => item.id === selectedIdRef.current);
      if (index < 0 || index === objectsRef.current.length - 1) return;
      const copy = [...objectsRef.current];
      const [object] = copy.splice(index, 1);
      copy.splice(index + 1, 0, object);
      objectsRef.current = copy;
      pushHistory();
      draw();
    },
    sendBackwards() {
      const index = objectsRef.current.findIndex((item) => item.id === selectedIdRef.current);
      if (index <= 0) return;
      const copy = [...objectsRef.current];
      const [object] = copy.splice(index, 1);
      copy.splice(index - 1, 0, object);
      objectsRef.current = copy;
      pushHistory();
      draw();
    }
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = BASE_WIDTH;
    canvas.height = BASE_HEIGHT;
    draw();
    syncEmpty();
  }, []);

  useEffect(() => {
    draw();
  }, [selectedId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleDown = (event: PointerEvent) => {
      const point = getPointer(event);
      canvas.setPointerCapture(event.pointerId);

      if (tool === 'select') {
        const hit = [...objectsRef.current].reverse().find((object) => isInside(point, object));
        setSelected(hit?.id || null);
        if (hit) dragStateRef.current = { id: hit.id, last: point };
        draw();
        return;
      }

      const object: SketchObject =
        tool === 'pencil'
          ? { id: makeId(), type: 'path', color, size: brushSize, points: [point] }
          : tool === 'rectangle'
            ? { id: makeId(), type: 'rectangle', color, size: Math.max(4, brushSize / 2), x: point.x, y: point.y, width: 0, height: 0 }
            : tool === 'circle'
              ? { id: makeId(), type: 'circle', color, size: Math.max(4, brushSize / 2), x: point.x, y: point.y, radius: 0 }
              : { id: makeId(), type: 'text', color, x: point.x, y: point.y, text: textValue || 'Text', fontSize: 68 };

      objectsRef.current = [...objectsRef.current, object];
      drawingObjectIdRef.current = object.id;
      drawStartRef.current = point;
      setSelected(tool === 'text' ? object.id : null);
      draw();

      if (tool === 'text') {
        drawingObjectIdRef.current = null;
        drawStartRef.current = null;
        pushHistory();
      }
    };

    const handleMove = (event: PointerEvent) => {
      const point = getPointer(event);

      if (dragStateRef.current) {
        const { id, last } = dragStateRef.current;
        const dx = point.x - last.x;
        const dy = point.y - last.y;
        objectsRef.current = objectsRef.current.map((object) => (object.id === id ? moveObject(object, dx, dy) : object));
        dragStateRef.current = { id, last: point };
        draw();
        return;
      }

      const drawingId = drawingObjectIdRef.current;
      if (!drawingId) return;
      const start = drawStartRef.current || point;
      objectsRef.current = objectsRef.current.map((object) => {
        if (object.id !== drawingId) return object;
        if (object.type === 'path') return { ...object, points: [...object.points, point] };
        if (object.type === 'rectangle') {
          const x = Math.min(start.x, point.x);
          const y = Math.min(start.y, point.y);
          return { ...object, x, y, width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) };
        }
        if (object.type === 'circle') {
          const radius = Math.hypot(point.x - start.x, point.y - start.y);
          return { ...object, x: start.x, y: start.y, radius };
        }
        return object;
      });
      draw();
    };

    const handleUp = () => {
      if (drawingObjectIdRef.current || dragStateRef.current) pushHistory();
      drawingObjectIdRef.current = null;
      drawStartRef.current = null;
      dragStateRef.current = null;
      draw();
    };

    canvas.addEventListener('pointerdown', handleDown);
    canvas.addEventListener('pointermove', handleMove);
    canvas.addEventListener('pointerup', handleUp);
    canvas.addEventListener('pointercancel', handleUp);

    return () => {
      canvas.removeEventListener('pointerdown', handleDown);
      canvas.removeEventListener('pointermove', handleMove);
      canvas.removeEventListener('pointerup', handleUp);
      canvas.removeEventListener('pointercancel', handleUp);
    };
  }, [tool, color, brushSize, textValue]);

  return (
    <canvas
      ref={canvasRef}
      aria-label="Sketch canvas"
      className="aspect-video w-full cursor-crosshair rounded-[22px] border border-violet-100 bg-slate-950 shadow-inner"
      style={{ touchAction: 'none' }}
    />
  );
});

SketchCanvas.displayName = 'SketchCanvas';
