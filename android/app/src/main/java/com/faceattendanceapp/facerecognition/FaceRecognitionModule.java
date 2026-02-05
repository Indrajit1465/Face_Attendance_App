package com.faceattendanceapp.facerecognition;

import androidx.annotation.NonNull;

import android.content.res.AssetFileDescriptor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;

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

            float[][][][] input = new float[1][INPUT_SIZE][INPUT_SIZE][3];

            for (int y = 0; y < INPUT_SIZE; y++) {
                for (int x = 0; x < INPUT_SIZE; x++) {
                    int px = resized.getPixel(x, y);

                    input[0][y][x][0] = ((px >> 16 & 0xff) - 127.5f) / 128f;
                    input[0][y][x][1] = ((px >> 8 & 0xff) - 127.5f) / 128f;
                    input[0][y][x][2] = ((px & 0xff) - 127.5f) / 128f;
                }
            }

            float[][] output = new float[1][EMBEDDING_SIZE];
            interpreter.run(input, output);

            // 🔑 L2 normalize
            float sum = 0f;
            for (float v : output[0])
                sum += v * v;

            float norm = (float) Math.sqrt(sum);
            if (norm < 1e-6) {
                promise.reject("EMBEDDING_ERROR", "Invalid embedding norm");
                return;
            }

            WritableArray embedding = Arguments.createArray();
            for (float v : output[0]) {
                embedding.pushDouble(v / norm);
            }

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
