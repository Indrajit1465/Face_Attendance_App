package com.faceattendanceapp.facedetection;

import android.content.res.AssetFileDescriptor;
import android.graphics.*;
import android.util.Log;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.*;

import org.tensorflow.lite.Interpreter;

import java.io.FileInputStream;
import java.nio.*;
import java.nio.channels.FileChannel;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

public class FaceDetectionModule extends ReactContextBaseJavaModule {

    private static final String TAG = "YOLO_FACE";

    private static final int INPUT_SIZE = 960;
    private static final float CONF_THRESHOLD = 0.75f; // ✅ was 0.25f
    private static final int MIN_BOX_SIZE = 120; // ✅ was 80
    private static final float PAD_FACTOR = 0.20f; // ✅ NEW: 20% padding around face

    private Interpreter interpreter;

    public FaceDetectionModule(ReactApplicationContext reactContext) {
        super(reactContext);
        loadModel();
    }

    @NonNull
    @Override
    public String getName() {
        return "FaceDetection";
    }

    private void loadModel() {
        try {
            AssetFileDescriptor fd = getReactApplicationContext()
                    .getAssets().openFd("yolov8n_face.tflite");

            FileInputStream fis = new FileInputStream(fd.getFileDescriptor());
            MappedByteBuffer model = fis.getChannel().map(
                    FileChannel.MapMode.READ_ONLY,
                    fd.getStartOffset(),
                    fd.getDeclaredLength());

            interpreter = new Interpreter(model);

            int[] inShape = interpreter.getInputTensor(0).shape();
            int[] outShape = interpreter.getOutputTensor(0).shape();
            Log.d(TAG, "YOLO input shape:  " + Arrays.toString(inShape));
            Log.d(TAG, "YOLO output shape: " + Arrays.toString(outShape));

            // ✅ Verify first raw output value to check if normalized or pixel-space
            Log.d(TAG, "YOLO loaded successfully");

        } catch (Exception e) {
            Log.e(TAG, "Model load failed", e);
        }
    }

    @ReactMethod
    public void detectFaces(String imagePath, float confThreshold, Promise promise) {
        try {
            Bitmap src = BitmapFactory.decodeFile(imagePath);
            if (src == null) {
                promise.resolve(Arguments.createArray());
                return;
            }

            LetterboxResult lb = letterbox(src);
            if (lb == null) {
                promise.resolve(Arguments.createArray());
                return;
            }

            ByteBuffer input = bitmapToBuffer(lb.bitmap);
            lb.bitmap.recycle();

            int[] outShape = interpreter.getOutputTensor(0).shape();
            int numBoxes = outShape[2];
            float[][][] output = new float[1][5][numBoxes];
            interpreter.run(input, output);

            // ✅ Use passed-in threshold instead of hardcoded constant
            WritableArray faces = parseOutput(output, src.getWidth(), src.getHeight(), lb, confThreshold);
            src.recycle();
            promise.resolve(faces);

        } catch (Exception e) {
            Log.e(TAG, "YOLO detect error", e);
            promise.reject("YOLO_ERROR", e);
        }
    }

    private static class LetterboxResult {
        Bitmap bitmap;
        float scale;
        int padX, padY;
    }

    private LetterboxResult letterbox(Bitmap src) {
        try {
            int w = src.getWidth();
            int h = src.getHeight();
            float scale = Math.min(INPUT_SIZE / (float) w, INPUT_SIZE / (float) h);

            int newW = Math.round(w * scale);
            int newH = Math.round(h * scale);

            Bitmap resized = Bitmap.createScaledBitmap(src, newW, newH, true);
            Bitmap canvas_bmp = Bitmap.createBitmap(INPUT_SIZE, INPUT_SIZE, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(canvas_bmp);

            canvas.drawColor(Color.rgb(114, 114, 114)); // ✅ standard YOLO letterbox gray

            int padX = (INPUT_SIZE - newW) / 2;
            int padY = (INPUT_SIZE - newH) / 2;
            canvas.drawBitmap(resized, padX, padY, null);
            resized.recycle(); // ✅

            LetterboxResult res = new LetterboxResult();
            res.bitmap = canvas_bmp;
            res.scale = scale;
            res.padX = padX;
            res.padY = padY;
            return res;

        } catch (Exception e) {
            Log.e(TAG, "Letterbox error: " + e.getMessage());
            return null;
        }
    }

    private ByteBuffer bitmapToBuffer(Bitmap bitmap) {
        ByteBuffer buffer = ByteBuffer.allocateDirect(INPUT_SIZE * INPUT_SIZE * 3 * 4);
        buffer.order(ByteOrder.nativeOrder());

        int[] pixels = new int[INPUT_SIZE * INPUT_SIZE];
        bitmap.getPixels(pixels, 0, INPUT_SIZE, 0, 0, INPUT_SIZE, INPUT_SIZE);

        for (int p : pixels) {
            buffer.putFloat(((p >> 16) & 0xFF) / 255f);
            buffer.putFloat(((p >> 8) & 0xFF) / 255f);
            buffer.putFloat((p & 0xFF) / 255f);
        }

        buffer.rewind();
        return buffer;
    }

    private static class FaceResult {
        int x, y, w, h;
        float conf;

        FaceResult(int x, int y, int w, int h, float conf) {
            this.x = x;
            this.y = y;
            this.w = w;
            this.h = h;
            this.conf = conf;
        }

        int area() {
            return w * h;
        }
    }

    private WritableArray parseOutput(
            float[][][] output, int origW, int origH,
            LetterboxResult lb, float confThreshold) {

        List<FaceResult> validFaces = new ArrayList<>();
        int boxes = output[0][0].length;

        // ✅ Log first box to confirm coordinate space
        if (boxes > 0) {
            Log.d(TAG, "=== RAW OUTPUT SAMPLE (Box 0) ===");
            Log.d(TAG, "cx_raw=" + output[0][0][0]
                    + " cy_raw=" + output[0][1][0]
                    + " w_raw=" + output[0][2][0]
                    + " h_raw=" + output[0][3][0]
                    + " conf=" + output[0][4][0]);
            Log.d(TAG, "Total boxes to scan: " + boxes);
        }

        for (int i = 0; i < boxes; i++) {
            float conf = output[0][4][i];
            if (conf < confThreshold)
                continue;

            // ✅ RESTORED: multiply by INPUT_SIZE — model outputs normalized coords (0–1)
            float cx = output[0][0][i] * INPUT_SIZE;
            float cy = output[0][1][i] * INPUT_SIZE;
            float bw = output[0][2][i] * INPUT_SIZE;
            float bh = output[0][3][i] * INPUT_SIZE;

            // Map from letterbox space → original image space
            float x = (cx - bw / 2f - lb.padX) / lb.scale;
            float y = (cy - bh / 2f - lb.padY) / lb.scale;
            float width = bw / lb.scale;
            float height = bh / lb.scale;

            int x1 = Math.round(x);
            int y1 = Math.round(y);
            int x2 = x1 + Math.round(width);
            int y2 = y1 + Math.round(height);

            // Clamp to image bounds
            x1 = Math.max(0, x1);
            y1 = Math.max(0, y1);
            x2 = Math.min(origW, x2);
            y2 = Math.min(origH, y2);

            int fW = x2 - x1;
            int fH = y2 - y1;

            if (fW < MIN_BOX_SIZE || fH < MIN_BOX_SIZE) {
                Log.d(TAG, "Box " + i + " rejected: too small " + fW + "×" + fH);
                continue;
            }

            // Apply 20% padding
            int padW = (int) (fW * PAD_FACTOR);
            int padH = (int) (fH * PAD_FACTOR);

            int pX1 = Math.max(0, x1 - padW);
            int pY1 = Math.max(0, y1 - padH);
            int pX2 = Math.min(origW, x2 + padW);
            int pY2 = Math.min(origH, y2 + padH);

            int pW = pX2 - pX1;
            int pH = pY2 - pY1;

            if (pW < MIN_BOX_SIZE || pH < MIN_BOX_SIZE)
                continue;

            Log.d(TAG, "✅ Valid face: x=" + pX1 + " y=" + pY1
                    + " w=" + pW + " h=" + pH
                    + " conf=" + String.format("%.3f", conf));

            validFaces.add(new FaceResult(pX1, pY1, pW, pH, conf));
        }

        Log.d(TAG, "Faces after filtering: " + validFaces.size());

        List<FaceResult> nmsFaces = nms(validFaces, 0.45f);
        Collections.sort(nmsFaces, (a, b) -> Integer.compare(b.area(), a.area()));

        WritableArray result = Arguments.createArray();
        for (FaceResult f : nmsFaces) {
            WritableMap face = Arguments.createMap();
            face.putInt("x", f.x);
            face.putInt("y", f.y);
            face.putInt("width", f.w);
            face.putInt("height", f.h);
            face.putDouble("confidence", f.conf);
            result.pushMap(face);
        }

        Log.d(TAG, "Final faces after NMS: " + nmsFaces.size());
        return result;
    }

    private List<FaceResult> nms(List<FaceResult> faces, float iouThreshold) {
        List<FaceResult> result = new ArrayList<>();
        Collections.sort(faces, (a, b) -> Float.compare(b.conf, a.conf));

        while (!faces.isEmpty()) {
            FaceResult best = faces.remove(0);
            result.add(best);
            List<FaceResult> remaining = new ArrayList<>();
            for (FaceResult f : faces) {
                if (iou(best, f) < iouThreshold)
                    remaining.add(f);
            }
            faces = remaining;
        }
        return result;
    }

    private float iou(FaceResult a, FaceResult b) {
        int x1 = Math.max(a.x, b.x);
        int y1 = Math.max(a.y, b.y);
        int x2 = Math.min(a.x + a.w, b.x + b.w);
        int y2 = Math.min(a.y + a.h, b.y + b.h);

        float interArea = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
        float unionArea = a.area() + b.area() - interArea;
        return interArea / unionArea;
    }
}