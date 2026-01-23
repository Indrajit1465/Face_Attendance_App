package com.faceattendanceapp.facedetection;

import android.graphics.Rect;
import android.net.Uri;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.*;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.face.*;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

public class FaceDetectionModule extends ReactContextBaseJavaModule {

    public FaceDetectionModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return "FaceDetection";
    }

    @ReactMethod
    public void detectFaces(String imagePath, Promise promise) {
        try {
            InputImage image = InputImage.fromFilePath(
                    getReactApplicationContext(),
                    Uri.fromFile(new File(imagePath)));

            FaceDetectorOptions options = new FaceDetectorOptions.Builder()
                    .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
                    .enableTracking()
                    .build();

            FaceDetector detector = FaceDetection.getClient(options);

            detector.process(image)
                    .addOnSuccessListener(faces -> {
                        WritableArray result = Arguments.createArray();

                        for (Face face : faces) {
                            Rect box = face.getBoundingBox();
                            WritableMap map = Arguments.createMap();
                            map.putInt("x", box.left);
                            map.putInt("y", box.top);
                            map.putInt("width", box.width());
                            map.putInt("height", box.height());
                            result.pushMap(map);
                        }

                        promise.resolve(result);
                    })
                    .addOnFailureListener(promise::reject);

        } catch (Exception e) {
            promise.reject("FACE_DETECT_ERROR", e);
        }
    }
}
