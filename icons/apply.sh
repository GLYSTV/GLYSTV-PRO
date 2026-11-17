#!/usr/bin/env bash
set -e
RES=android/app/src/main/res
find $RES -path '*/mipmap-*' -name 'ic_launcher*' -delete
cp -r icons/res/* $RES/
echo "Icono GLYSTV PRO aplicado"
