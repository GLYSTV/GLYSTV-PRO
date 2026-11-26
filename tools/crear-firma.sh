#!/usr/bin/env bash
# Prepara la llave de firma de GLYSTV-PRO para guardarla en los secrets de GitHub.
# Se usa UNA vez (Termux, Linux o Mac con Java/keytool). NO subas el .jks ni las contraseñas al repositorio.
#
# Opción A (recomendada): llave NUEVA.            bash tools/crear-firma.sh nueva
# Opción B (sin desinstalar): conservar la MISMA firma de las versiones anteriores, pero con
#          contraseña nueva y fuera del repo.     bash tools/crear-firma.sh migrar ruta/debug.keystore
set -euo pipefail
MODO="${1:-}"; OUT="glystv-pro.jks"; ALIAS="glystv"
[ -n "$MODO" ] || { sed -n '2,8p' "$0"; exit 1; }
read -r -s -p "Contraseña NUEVA de la llave (mínimo 8 caracteres, guárdala): " PW; echo
[ "${#PW}" -ge 8 ] || { echo "Muy corta."; exit 1; }
rm -f "$OUT"
case "$MODO" in
  nueva)
    keytool -genkeypair -v -keystore "$OUT" -storetype PKCS12 -alias "$ALIAS" -keyalg RSA -keysize 2048 \
      -validity 36500 -storepass "$PW" -keypass "$PW" -dname "CN=GLYSTV-PRO, O=GLYSTV, C=US" ;;
  migrar)
    SRC="${2:?Indica la ruta del debug.keystore viejo}"
    keytool -importkeystore -srckeystore "$SRC" -srcstorepass android -srcalias androiddebugkey -srckeypass android \
      -destkeystore "$OUT" -deststoretype PKCS12 -destalias "$ALIAS" -deststorepass "$PW" -destkeypass "$PW" ;;
  *) echo "Modo desconocido: $MODO"; exit 1 ;;
esac
base64 -w0 "$OUT" > "$OUT.b64" 2>/dev/null || base64 "$OUT" | tr -d '\n' > "$OUT.b64"
echo
echo "Listo. Archivos creados: $OUT (la llave) y $OUT.b64 (para el secret)."
echo "En GitHub > Settings > Secrets and variables > Actions crea estos 4 secrets:"
echo "  KEYSTORE_BASE64   = contenido de $OUT.b64"
echo "  KEYSTORE_PASSWORD = la contraseña que escribiste"
echo "  KEY_ALIAS         = $ALIAS"
echo "  KEY_PASSWORD      = la misma contraseña"
echo "Guarda $OUT y la contraseña en un lugar seguro FUERA del repositorio: si los pierdes, nadie podrá actualizar sin desinstalar."
