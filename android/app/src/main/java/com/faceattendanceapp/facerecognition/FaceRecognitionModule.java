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

/**
 * FaceRecognitionModule
 *
 * ✔ Uses MobileFaceNet
 * ✔ Accepts FACE-ONLY cropped image
 * ✔ Pads to square (NO distortion)
 * ✔ L2-normalized embeddings
 * ✔ Stable for cosine similarity
 */
public class FaceRecognitionModule extends ReactContextBaseJavaModule {

    private static final int INPUT_SIZE = 112;
    private static final int EMBEDDING_SIZE = 192;

    private Interpreter interpreter;

    public FaceRecognitionModule(ReactApplicationContext reactContext) {
        super(reactContext);
        try {
            Interpreter.Options options = new Interpreter.Options();
            options.setNumThreads(4);
            options.setUseXNNPACK(true);

            interpreter = new Interpreter(loadModelFile("mobile_facenet.tflite"), options);
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

            // 🔑 Pad to square (CRITICAL)
            Bitmap square = makeSquare(bitmap);
            Bitmap resized = Bitmap.createScaledBitmap(square, INPUT_SIZE, INPUT_SIZE, true);

            Log.d("BIOMETRIC_AUDIT", "Original Bitmap: " + bitmap.getWidth() + "x" + bitmap.getHeight());
            Log.d("BIOMETRIC_AUDIT", "Resized Native Bitmap: " + resized.getWidth() + "x" + resized.getHeight());

            float[][][][] input = new float[1][INPUT_SIZE][INPUT_SIZE][3];

            for (int y = 0; y < INPUT_SIZE; y++) {
                for (int x = 0; x < INPUT_SIZE; x++) {
                    int px = resized.getPixel(x, y);

                    input[0][y][x][0] = ((px >> 16 & 0xff) - 127.5f) / 128f;
                    input[0][y][x][1] = ((px >> 8 & 0xff) - 127.5f) / 128f;
                    input[0][y][x][2] = ((px & 0xff) - 127.5f) / 128f;
                }
            }

            Log.d("BIOMETRIC_AUDIT", "First 5 pixels (RGB input values):");
            for (int i = 0; i < 5; i++) {
                Log.d("BIOMETRIC_AUDIT", "Px " + i + " -> R:" + input[0][0][i][0] + " G:" + input[0][0][i][1] + " B:"
                        + input[0][0][i][2]);
            }

            float[][] output = new float[1][EMBEDDING_SIZE];
            interpreter.run(input, output);

            // 🔑 L2 normalize
            float sum = 0f;
            for (float v : output[0])
                sum += v * v;

            float normBefore = (float) Math.sqrt(sum);
            Log.d("BIOMETRIC_AUDIT", "Embedding length: " + output[0].length);
            Log.d("BIOMETRIC_AUDIT", "Norm BEFORE normalization: " + normBefore);

            if (normBefore < 1e-6) {
                promise.reject("EMBEDDING_ERROR", "Invalid embedding norm");
                return;
            }

            WritableArray embedding = Arguments.createArray();
            float sumAfter = 0f;
            for (float v : output[0]) {
                float val = v / normBefore;
                embedding.pushDouble(val);
                sumAfter += val * val;
            }
            float normAfter = (float) Math.sqrt(sumAfter);
            Log.d("BIOMETRIC_AUDIT", "Norm AFTER normalization: " + normAfter);

            promise.resolve(embedding);

        } catch (Exception e) {
            promise.reject("EMBEDDING_ERROR", e);
        }
    }

    // =========================
    // Utility: pad bitmap to square
    // =========================
    private Bitmap makeSquare(Bitmap src) {
        int size = Math.max(src.getWidth(), src.getHeight());
        Bitmap output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);

        Canvas canvas = new Canvas(output);
        canvas.drawColor(Color.BLACK);

        int left = (size - src.getWidth()) / 2;
        int top = (size - src.getHeight()) / 2;

        canvas.drawBitmap(src, left, top, null);
        return output;
    }
}
