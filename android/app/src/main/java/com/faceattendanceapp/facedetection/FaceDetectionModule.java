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
import java.util.Comparator;
import java.util.List;

public class FaceDetectionModule extends ReactContextBaseJavaModule {

    private static final String TAG = "YOLO_FACE";

    private static final int INPUT_SIZE = 960;
    private static final float CONF_THRESHOLD = 0.25f;
    private static final int MIN_BOX_SIZE = 80;

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

    // =========================
    // Model loading
    // =========================
    private void loadModel() {
        try {
            AssetFileDescriptor fd = getReactApplicationContext()
                    .getAssets()
                    .openFd("yolov8n_face.tflite");

            FileInputStream fis = new FileInputStream(fd.getFileDescriptor());
            FileChannel channel = fis.getChannel();

            MappedByteBuffer model = channel.map(
                    FileChannel.MapMode.READ_ONLY,
                    fd.getStartOffset(),
                    fd.getDeclaredLength());

            interpreter = new Interpreter(model);

            Log.d(TAG, "YOLO loaded");
            Log.d(TAG, "Input shape: " +
                    Arrays.toString(interpreter.getInputTensor(0).shape()));
            Log.d(TAG, "Output shape: " +
                    Arrays.toString(interpreter.getOutputTensor(0).shape()));

        } catch (Exception e) {
            Log.e(TAG, "Model load failed", e);
        }
    }

    // =========================
    // JS → Native API
    // =========================
    @ReactMethod
    public void detectFaces(String imagePath, Promise promise) {
        try {
            Bitmap src = BitmapFactory.decodeFile(imagePath);
            if (src == null) {
                promise.resolve(Arguments.createArray());
                return;
            }

            LetterboxResult lb = letterbox(src);
            ByteBuffer input = bitmapToBuffer(lb.bitmap);

            int[] outShape = interpreter.getOutputTensor(0).shape();
            int numBoxes = outShape[2];

            float[][][] output = new float[1][5][numBoxes];
            interpreter.run(input, output);

            WritableArray faces = parseOutput(
                    output,
                    src.getWidth(),
                    src.getHeight(),
                    lb);

            promise.resolve(faces);

        } catch (Exception e) {
            Log.e(TAG, "YOLO detect error", e);
            promise.reject("YOLO_ERROR", e);
        }
    }

    // =========================
    // Letterbox resize
    // =========================
    private static class LetterboxResult {
        Bitmap bitmap;
        float scale;
        int padX;
        int padY;
    }

    private LetterboxResult letterbox(Bitmap src) {
        int w = src.getWidth();
        int h = src.getHeight();

        float scale = Math.min(
                INPUT_SIZE / (float) w,
                INPUT_SIZE / (float) h);

        int newW = Math.round(w * scale);
        int newH = Math.round(h * scale);

        Bitmap resized = Bitmap.createScaledBitmap(src, newW, newH, true);
        Bitmap output = Bitmap.createBitmap(
                INPUT_SIZE,
                INPUT_SIZE,
                Bitmap.Config.ARGB_8888);

        Canvas canvas = new Canvas(output);
        canvas.drawColor(Color.BLACK);

        int padX = (INPUT_SIZE - newW) / 2;
        int padY = (INPUT_SIZE - newH) / 2;

        canvas.drawBitmap(resized, padX, padY, null);

        LetterboxResult res = new LetterboxResult();
        res.bitmap = output;
        res.scale = scale;
        res.padX = padX;
        res.padY = padY;

        return res;
    }

    // =========================
    // Bitmap → Tensor
    // =========================
    private ByteBuffer bitmapToBuffer(Bitmap bitmap) {
        ByteBuffer buffer = ByteBuffer.allocateDirect(
                INPUT_SIZE * INPUT_SIZE * 3 * 4);
        buffer.order(ByteOrder.nativeOrder());

        int[] pixels = new int[INPUT_SIZE * INPUT_SIZE];
        bitmap.getPixels(
                pixels,
                0,
                INPUT_SIZE,
                0,
                0,
                INPUT_SIZE,
                INPUT_SIZE);

        for (int p : pixels) {
            buffer.putFloat(((p >> 16) & 0xFF) / 255f);
            buffer.putFloat(((p >> 8) & 0xFF) / 255f);
            buffer.putFloat((p & 0xFF) / 255f);
        }

        buffer.rewind();
        return buffer;
    }

    // =========================
    // Helper class
    // =========================
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

    // =========================
    // Output parsing with NMS
    // =========================
    private WritableArray parseOutput(
            float[][][] output,
            int origW,
            int origH,
            LetterboxResult lb) {

        List<FaceResult> validFaces = new ArrayList<>();
        int boxes = output[0][0].length;

        for (int i = 0; i < boxes; i++) {
            float conf = output[0][4][i];
            if (conf < CONF_THRESHOLD)
                continue;

            float cx = output[0][0][i] * INPUT_SIZE;
            float cy = output[0][1][i] * INPUT_SIZE;
            float w = output[0][2][i] * INPUT_SIZE;
            float h = output[0][3][i] * INPUT_SIZE;

            float x = (cx - w / 2f - lb.padX) / lb.scale;
            float y = (cy - h / 2f - lb.padY) / lb.scale;
            float width = w / lb.scale;
            float height = h / lb.scale;

            int ix = Math.max(0, Math.round(x));
            int iy = Math.max(0, Math.round(y));
            int iw = Math.round(width);
            int ih = Math.round(height);

            if (iw < MIN_BOX_SIZE || ih < MIN_BOX_SIZE)
                continue;
            if (ix + iw > origW)
                iw = origW - ix;
            if (iy + ih > origH)
                ih = origH - iy;
            if (iw <= 0 || ih <= 0)
                continue;

            validFaces.add(new FaceResult(ix, iy, iw, ih, conf));
        }

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

        Log.d(TAG, "Faces detected after NMS: " + nmsFaces.size());
        return result;
    }

    // =========================
    // NMS
    // =========================
    private List<FaceResult> nms(List<FaceResult> faces, float iouThreshold) {
        List<FaceResult> result = new ArrayList<>();

        Collections.sort(faces, (a, b) -> Float.compare(b.conf, a.conf));

        while (!faces.isEmpty()) {
            FaceResult best = faces.remove(0);
            result.add(best);

            List<FaceResult> remaining = new ArrayList<>();
            for (FaceResult f : faces) {
                if (iou(best, f) < iouThreshold) {
                    remaining.add(f);
                }
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

        int interW = Math.max(0, x2 - x1);
        int interH = Math.max(0, y2 - y1);

        float interArea = interW * interH;
        float unionArea = a.area() + b.area() - interArea;

        return interArea / unionArea;
    }
}
