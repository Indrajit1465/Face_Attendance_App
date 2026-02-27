package com.faceattendanceapp.facerecognition;

import androidx.annotation.NonNull;

import android.content.res.AssetFileDescriptor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;

import org.tensorflow.lite.Interpreter;

import java.io.FileInputStream;
import java.io.IOException;
import java.nio.MappedByteBuffer;
import java.nio.channels.FileChannel;
import java.util.Arrays;

public class FaceRecognitionModule extends ReactContextBaseJavaModule {

    private static final String TAG = "BIOMETRIC_AUDIT";
    private static final int INPUT_SIZE = 112;
    private static int EMBEDDING_SIZE = 192; // Will be verified at runtime

    private Interpreter interpreter;

    public FaceRecognitionModule(ReactApplicationContext reactContext) {
        super(reactContext);
        try {
            Interpreter.Options options = new Interpreter.Options();
            options.setNumThreads(4);
            options.setUseXNNPACK(true);

            interpreter = new Interpreter(loadModelFile("mobile_facenet.tflite"), options);

            // ✅ Verify model shapes at startup
            int[] inputShape = interpreter.getInputTensor(0).shape();
            int[] outputShape = interpreter.getOutputTensor(0).shape();
            Log.d(TAG, "Model input shape:  " + Arrays.toString(inputShape));
            Log.d(TAG, "Model output shape: " + Arrays.toString(outputShape));

            // Auto-set embedding size from model
            EMBEDDING_SIZE = outputShape[1];
            Log.d(TAG, "EMBEDDING_SIZE set to: " + EMBEDDING_SIZE);

            if (inputShape[1] != INPUT_SIZE || inputShape[2] != INPUT_SIZE) {
                Log.e(TAG, "⚠️ Input shape mismatch! Model expects: "
                        + Arrays.toString(inputShape)
                        + " but INPUT_SIZE=" + INPUT_SIZE);
            }

        } catch (IOException e) {
            e.printStackTrace();
            interpreter = null;
        }
    }

    @NonNull
    @Override
    public String getName() {
        return "FaceRecognition";
    }

    private MappedByteBuffer loadModelFile(String modelName) throws IOException {
        AssetFileDescriptor fileDescriptor = getReactApplicationContext().getAssets().openFd(modelName);
        FileInputStream inputStream = new FileInputStream(fileDescriptor.getFileDescriptor());
        FileChannel fileChannel = inputStream.getChannel();
        return fileChannel.map(
                FileChannel.MapMode.READ_ONLY,
                fileDescriptor.getStartOffset(),
                fileDescriptor.getDeclaredLength());
    }

    @ReactMethod
    public void getEmbedding(String imagePath, Promise promise) {
        try {
            if (interpreter == null) {
                promise.reject("MODEL_NOT_LOADED", "TFLite model not loaded");
                return;
            }

            Bitmap bitmap = BitmapFactory.decodeFile(imagePath);
            if (bitmap == null) {
                promise.reject("IMAGE_ERROR", "Unable to decode image");
                return;
            }

            // ✅ Pad to square using neutral gray (not black)
            Bitmap square = makeSquare(bitmap);
            bitmap.recycle();

            Bitmap resized = Bitmap.createScaledBitmap(square, INPUT_SIZE, INPUT_SIZE, true);
            square.recycle();

            Log.d(TAG, "Resized bitmap: " + resized.getWidth() + "x" + resized.getHeight());

            // ✅ Normalize pixels to [-1, 1]
            float[][][][] input = new float[1][INPUT_SIZE][INPUT_SIZE][3];
            for (int y = 0; y < INPUT_SIZE; y++) {
                for (int x = 0; x < INPUT_SIZE; x++) {
                    int px = resized.getPixel(x, y);
                    input[0][y][x][0] = ((px >> 16 & 0xff) - 127.5f) / 128f; // R
                    input[0][y][x][1] = ((px >> 8 & 0xff) - 127.5f) / 128f; // G
                    input[0][y][x][2] = ((px & 0xff) - 127.5f) / 128f; // B
                }
            }
            resized.recycle();

            // Log first 5 pixel values
            Log.d(TAG, "First 5 pixels (normalized):");
            for (int i = 0; i < 5; i++) {
                Log.d(TAG, "Px" + i + " R:" + input[0][0][i][0]
                        + " G:" + input[0][0][i][1]
                        + " B:" + input[0][0][i][2]);
            }

            // ✅ Run inference
            float[][] output = new float[1][EMBEDDING_SIZE];
            interpreter.run(input, output);

            // ✅ L2 normalize output
            float sumSq = 0f;
            for (float val : output[0])
                sumSq += val * val;
            float norm = (float) Math.sqrt(sumSq);

            Log.d(TAG, "Embedding norm BEFORE normalization: " + norm);

            if (norm < 1e-6f) {
                promise.reject("EMBEDDING_ERROR", "Near-zero norm — bad crop or blank frame");
                return;
            }

            // ✅ Check for NaN/Infinity in raw output
            for (float val : output[0]) {
                if (!Float.isFinite(val)) {
                    promise.reject("EMBEDDING_ERROR", "Non-finite value in model output");
                    return;
                }
            }

            WritableArray embedding = Arguments.createArray();
            float sumAfter = 0f;
            for (float val : output[0]) {
                float normalized = val / norm;
                embedding.pushDouble(normalized);
                sumAfter += normalized * normalized;
            }

            float normAfter = (float) Math.sqrt(sumAfter);
            Log.d(TAG, "Embedding norm AFTER normalization: " + normAfter);

            // ✅ Sanity check unit vector
            if (Math.abs(normAfter - 1.0f) > 0.01f) {
                promise.reject("EMBEDDING_ERROR", "Normalization failed — norm=" + normAfter);
                return;
            }

            promise.resolve(embedding);

        } catch (Exception e) {
            Log.e(TAG, "getEmbedding error: " + e.getMessage());
            promise.reject("EMBEDDING_ERROR", e);
        }
    }

    // ✅ Pad to square with neutral gray (127,127,127) — not black
    private Bitmap makeSquare(Bitmap src) {
        int size = Math.max(src.getWidth(), src.getHeight());
        Bitmap output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(output);

        // Gray (127) normalizes to ~-0.004 (near-neutral)
        // Black (0) normalizes to -0.996 (strong spurious signal)
        canvas.drawColor(Color.rgb(127, 127, 127));

        int left = (size - src.getWidth()) / 2;
        int top = (size - src.getHeight()) / 2;
        canvas.drawBitmap(src, left, top, null);
        return output;
    }
}