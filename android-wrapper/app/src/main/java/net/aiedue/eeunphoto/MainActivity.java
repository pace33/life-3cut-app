package net.aiedue.eeunphoto;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final String APP_URL = "https://" + APP_HOST + "/assets/index.html";
    private static final int APP_PERMISSION_REQUEST = 100;
    private static final int WEB_CAMERA_PERMISSION_REQUEST = 101;
    private static final int FILE_CHOOSER_REQUEST = 102;

    private final ExecutorService saveExecutor = Executors.newSingleThreadExecutor();
    private WebView webView;
    private PermissionRequest pendingWebPermission;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri captureImageUri;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.rgb(247, 251, 255));
        getWindow().setNavigationBarColor(Color.rgb(247, 251, 255));
        getWindow().getDecorView().setSystemUiVisibility(
                android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                        | android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        );

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(247, 251, 255));
        webView.setKeepScreenOn(true);
        setContentView(webView);

        configureWebView();
        requestInitialPermissions();
        webView.loadUrl(APP_URL);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);

        webView.addJavascriptInterface(new AndroidBridge(), "AndroidApp");
        webView.setWebViewClient(new LocalAssetWebViewClient());
        webView.setWebChromeClient(new AppWebChromeClient());
    }

    private void requestInitialPermissions() {
        List<String> permissions = new ArrayList<>();
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.CAMERA);
        }
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
        }

        if (!permissions.isEmpty()) {
            requestPermissions(permissions.toArray(new String[0]), APP_PERMISSION_REQUEST);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == WEB_CAMERA_PERMISSION_REQUEST && pendingWebPermission != null) {
            if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                pendingWebPermission.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            } else {
                pendingWebPermission.deny();
                Toast.makeText(this, R.string.camera_permission_needed, Toast.LENGTH_LONG).show();
            }
            pendingWebPermission = null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || filePathCallback == null) return;

        Uri[] results = null;
        if (resultCode == RESULT_OK) {
            if (captureImageUri != null && (data == null || data.getData() == null)) {
                finishPendingCapture(captureImageUri);
                results = new Uri[]{captureImageUri};
            } else {
                results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
                deleteUnusedCapture();
            }
        } else {
            deleteUnusedCapture();
        }

        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
        captureImageUri = null;
    }

    @Override
    protected void onDestroy() {
        if (pendingWebPermission != null) pendingWebPermission.deny();
        if (filePathCallback != null) filePathCallback.onReceiveValue(null);
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.destroy();
        }
        saveExecutor.shutdown();
        super.onDestroy();
    }

    private final class AppWebChromeClient extends WebChromeClient {
        @Override
        public void onPermissionRequest(PermissionRequest request) {
            runOnUiThread(() -> {
                Uri origin = request.getOrigin();
                boolean trustedOrigin = origin != null && APP_HOST.equals(origin.getHost());
                boolean requestsCamera = Arrays.asList(request.getResources())
                        .contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE);

                if (!trustedOrigin || !requestsCamera) {
                    request.deny();
                    return;
                }

                if (checkSelfPermission(Manifest.permission.CAMERA)
                        == PackageManager.PERMISSION_GRANTED) {
                    request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                    return;
                }

                pendingWebPermission = request;
                requestPermissions(
                        new String[]{Manifest.permission.CAMERA},
                        WEB_CAMERA_PERMISSION_REQUEST
                );
            });
        }

        @Override
        public void onPermissionRequestCanceled(PermissionRequest request) {
            if (pendingWebPermission == request) pendingWebPermission = null;
        }

        @Override
        public boolean onShowFileChooser(
                WebView view,
                ValueCallback<Uri[]> callback,
                FileChooserParams params
        ) {
            if (filePathCallback != null) filePathCallback.onReceiveValue(null);
            filePathCallback = callback;

            Intent intent;
            if (params.isCaptureEnabled()) {
                captureImageUri = createCaptureUri();
                if (captureImageUri != null) {
                    intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    intent.putExtra(MediaStore.EXTRA_OUTPUT, captureImageUri);
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                    intent.setClipData(ClipData.newRawUri("capture", captureImageUri));
                } else {
                    intent = params.createIntent();
                }
            } else {
                intent = params.createIntent();
            }

            try {
                startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                return true;
            } catch (Exception error) {
                deleteUnusedCapture();
                filePathCallback.onReceiveValue(null);
                filePathCallback = null;
                captureImageUri = null;
                return false;
            }
        }
    }

    private final class LocalAssetWebViewClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!"https".equals(uri.getScheme()) || !APP_HOST.equals(uri.getHost())) {
                return super.shouldInterceptRequest(view, request);
            }

            String path = uri.getPath();
            if (path == null || !path.startsWith("/assets/")) return notFoundResponse();
            String assetPath = path.substring("/assets/".length());
            if (assetPath.isEmpty()) assetPath = "index.html";
            if (assetPath.contains("..")) return notFoundResponse();

            try {
                InputStream stream = getAssets().open(assetPath);
                String mimeType = mimeTypeFor(assetPath);
                String encoding = mimeType.startsWith("text/") || mimeType.contains("javascript")
                        ? "UTF-8"
                        : null;
                Map<String, String> headers = new HashMap<>();
                headers.put("Cache-Control", "no-store");
                return new WebResourceResponse(mimeType, encoding, 200, "OK", headers, stream);
            } catch (IOException error) {
                return notFoundResponse();
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (APP_HOST.equals(uri.getHost())) return false;

            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception ignored) {
                Toast.makeText(MainActivity.this, "링크를 열 수 없어요.", Toast.LENGTH_SHORT).show();
            }
            return true;
        }
    }

    private final class AndroidBridge {
        @JavascriptInterface
        public void saveImage(String dataUrl, String requestedFileName) {
            saveExecutor.execute(() -> {
                try {
                    int commaIndex = dataUrl.indexOf(',');
                    if (commaIndex < 0) throw new IOException("Invalid image data");
                    byte[] bytes = Base64.decode(dataUrl.substring(commaIndex + 1), Base64.DEFAULT);
                    String fileName = safePngFileName(requestedFileName);
                    savePng(bytes, fileName);
                    runOnUiThread(() -> Toast.makeText(
                            MainActivity.this,
                            R.string.photo_saved,
                            Toast.LENGTH_LONG
                    ).show());
                } catch (Exception error) {
                    runOnUiThread(() -> Toast.makeText(
                            MainActivity.this,
                            R.string.photo_save_failed,
                            Toast.LENGTH_LONG
                    ).show());
                }
            });
        }
    }

    private void savePng(byte[] bytes, String fileName) throws IOException {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
            values.put(
                    MediaStore.Images.Media.RELATIVE_PATH,
                    Environment.DIRECTORY_PICTURES + "/EeunPhotoBooth"
            );
            values.put(MediaStore.Images.Media.IS_PENDING, 1);

            Uri uri = getContentResolver().insert(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                    values
            );
            if (uri == null) throw new IOException("Could not create image");

            try (OutputStream output = getContentResolver().openOutputStream(uri)) {
                if (output == null) throw new IOException("Could not open image");
                output.write(bytes);
            } catch (IOException error) {
                getContentResolver().delete(uri, null, null);
                throw error;
            }

            values.clear();
            values.put(MediaStore.Images.Media.IS_PENDING, 0);
            getContentResolver().update(uri, values, null, null);
            return;
        }

        File picturesDirectory;
        if (checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                == PackageManager.PERMISSION_GRANTED) {
            picturesDirectory = new File(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),
                    "EeunPhotoBooth"
            );
        } else {
            picturesDirectory = new File(
                    getExternalFilesDir(Environment.DIRECTORY_PICTURES),
                    "EeunPhotoBooth"
            );
        }

        if (!picturesDirectory.exists() && !picturesDirectory.mkdirs()) {
            throw new IOException("Could not create picture directory");
        }
        File outputFile = new File(picturesDirectory, fileName);
        try (OutputStream output = new FileOutputStream(outputFile)) {
            output.write(bytes);
        }
        MediaScannerConnection.scanFile(
                this,
                new String[]{outputFile.getAbsolutePath()},
                new String[]{"image/png"},
                null
        );
    }

    private Uri createCaptureUri() {
        try {
            ContentValues values = new ContentValues();
            values.put(
                    MediaStore.Images.Media.DISPLAY_NAME,
                    "eeun-camera-" + timestamp() + ".jpg"
            );
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.put(
                        MediaStore.Images.Media.RELATIVE_PATH,
                        Environment.DIRECTORY_PICTURES + "/EeunPhotoBooth"
                );
                values.put(MediaStore.Images.Media.IS_PENDING, 1);
            }
            return getContentResolver().insert(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                    values
            );
        } catch (Exception error) {
            return null;
        }
    }

    private void finishPendingCapture(Uri uri) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return;
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.IS_PENDING, 0);
        getContentResolver().update(uri, values, null, null);
    }

    private void deleteUnusedCapture() {
        if (captureImageUri != null) {
            getContentResolver().delete(captureImageUri, null, null);
        }
    }

    private static String safePngFileName(String requestedName) {
        String cleanName = requestedName == null
                ? "eeun-photo-" + timestamp() + ".png"
                : requestedName.replaceAll("[\\\\/:*?\"<>|]", "").trim();
        if (cleanName.isEmpty()) cleanName = "eeun-photo-" + timestamp() + ".png";
        if (!cleanName.toLowerCase(Locale.ROOT).endsWith(".png")) cleanName += ".png";
        return cleanName;
    }

    private static String timestamp() {
        return new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date());
    }

    private static String mimeTypeFor(String path) {
        String extension = MimeTypeMap.getFileExtensionFromUrl(path);
        String mimeType = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
        if (mimeType != null) return mimeType;
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".html")) return "text/html";
        return "application/octet-stream";
    }

    private static WebResourceResponse notFoundResponse() {
        byte[] body = "Not found".getBytes(StandardCharsets.UTF_8);
        return new WebResourceResponse(
                "text/plain",
                "UTF-8",
                404,
                "Not Found",
                Collections.emptyMap(),
                new ByteArrayInputStream(body)
        );
    }
}

