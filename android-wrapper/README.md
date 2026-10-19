# Android APK wrapper

This Android app bundles the 3-cut photo booth files in the APK and serves them
from a secure local HTTPS origin inside WebView. The native wrapper grants camera
access only to that local origin and saves exported PNG files to
`Pictures/EeunPhotoBooth`.

## Build

Use JDK 17, Android SDK platform 37, SDK Build Tools 36.0.0, Gradle 9.3.1,
and Android Gradle Plugin 9.1.1.

```powershell
gradle.bat :app:assembleRelease
```

The installable APK is generated at:

`app/build/outputs/apk/release/app-release.apk`

