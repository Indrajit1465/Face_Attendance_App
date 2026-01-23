package com.faceattendanceapp.facerecognition;

import androidx.annotation.NonNull;

import android.content.res.AssetFileDescriptor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;

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

public class FaceRecognitionModule extends ReactContextBaseJavaModule {

    private Interpreter interpreter;

    public FaceRecognitionModule(ReactApplicationContext reactContext) {
        super(reactContext);

        try {
            interpreter = new Interpreter(loadModelFile("mobile_facenet.tflite"));
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

        long startOffset = fileDescriptor.getStartOffset();
        long declaredLength = fileDescriptor.getDeclaredLength();

        return fileChannel.map(
                FileChannel.MapMode.READ_ONLY,
                startOffset,
                declaredLength);
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

            Bitmap resized = Bitmap.createScaledBitmap(bitmap, 112, 112, true);

            float[][][][] input = new float[1][112][112][3];

            for (int y = 0; y < 112; y++) {
                for (int x = 0; x < 112; x++) {
                    int px = resized.getPixel(x, y);

                    input[0][y][x][0] = ((px >> 16 & 0xff) - 127.5f) / 128f;
                    input[0][y][x][1] = ((px >> 8 & 0xff) - 127.5f) / 128f;
                    input[0][y][x][2] = ((px & 0xff) - 127.5f) / 128f;
                }
            }

            float[][] output = new float[1][192];
            interpreter.run(input, output);

            WritableArray embedding = Arguments.createArray();
            for (float v : output[0]) {
                embedding.pushDouble(v);
            }

            promise.resolve(embedding);

        } catch (Exception e) {
            promise.reject("EMBEDDING_ERROR", e);
        }
    }
}
