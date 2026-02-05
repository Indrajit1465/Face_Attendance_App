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
import java.util.Arrays;

public class FaceDetectionModule extends ReactContextBaseJavaModule {

    private static final String TAG = "YOLO_FACE";

    // Model input size
    private static final int INPUT_SIZE = 960;
    private static final float CONF_THRESHOLD = 0.20f;
    private static final int MIN_BOX_SIZE = 1;

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
    // Output parsing (pixel-accurate)
    // =========================
    private WritableArray parseOutput(
            float[][][] output,
            int origW,
            int origH,
            LetterboxResult lb) {
        WritableArray result = Arguments.createArray();
        int boxes = output[0][0].length;

        for (int i = 0; i < boxes; i++) {
            float conf = output[0][4][i];
            if (conf < CONF_THRESHOLD)
                continue;

            // YOLO outputs are NORMALIZED (0–1)
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

            WritableMap face = Arguments.createMap();
            face.putInt("x", ix);
            face.putInt("y", iy);
            face.putInt("width", iw);
            face.putInt("height", ih);
            face.putDouble("confidence", conf);

            result.pushMap(face);
        }

        Log.d(TAG, "Faces detected: " + result.size());
        return result;
    }
}
