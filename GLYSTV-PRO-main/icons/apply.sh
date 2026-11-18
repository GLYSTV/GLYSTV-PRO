#!/usr/bin/env bash
set -e
RES=android/app/src/main/res
find $RES -path '*/mipmap-*' -name 'ic_launcher*' -delete
cp -r icons/res/* $RES/

# Soporte para Android TV: aparece en el menu principal con su banner
python3 - <<'PY'
import re
p='android/app/src/main/AndroidManifest.xml'
s=open(p,encoding='utf-8').read()
if 'LEANBACK_LAUNCHER' not in s:
    s=re.sub(r'(<category android:name="android.intent.category.LAUNCHER"\s*/>)',
             r'\1\n                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />',s,count=1)
    s=s.replace('<application','<application android:banner="@drawable/banner"',1)
    s=s.replace('<application','<uses-feature android:name="android.software.leanback" android:required="false" />\n    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />\n    <application',1)
    open(p,'w',encoding='utf-8').write(s)
print('Manifest TV listo' if 'LEANBACK_LAUNCHER' in s else 'AVISO: no se pudo parchear el manifest')
PY
echo "Icono GLYSTV PRO aplicado"
