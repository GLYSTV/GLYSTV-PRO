package com.glystv.exo;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

@CapacitorPlugin(name = "ExoPlayer")
public class ExoPlayerPlugin extends Plugin {

    private BroadcastReceiver dlReceiver;

    @PluginMethod
    public void play(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url requerida");
            return;
        }
        Intent i = new Intent(getContext(), PlayerActivity.class);
        i.putExtra("url", url);
        i.putExtra("title", call.getString("title", ""));
        i.putExtra("alt", call.getString("alt", ""));
        getActivity().startActivity(i);
        call.resolve();
    }

    /** Abre una URL en el navegador del sistema (respaldo para descargar el APK). */
    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url requerida");
            return;
        }
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("no se pudo abrir: " + e.getMessage());
        }
    }

    /** Descarga el APK con DownloadManager y abre el instalador al terminar. */
    @PluginMethod
    public void installApk(PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url requerida");
            return;
        }
        final Context ctx = getContext();
        try {
            // Android 8+: la app necesita permiso para instalar APK
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    && !ctx.getPackageManager().canRequestPackageInstalls()) {
                Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + ctx.getPackageName()));
                s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(s);
                JSObject r = new JSObject();
                r.put("status", "permiso");
                call.resolve(r);
                return;
            }

            File dir = ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) {
                call.reject("sin almacenamiento");
                return;
            }
            final File apk = new File(dir, "GLYSTV-PRO.apk");
            if (apk.exists()) apk.delete();

            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setTitle("GLYSTV-PRO");
            req.setDescription("Descargando actualización");
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationUri(Uri.fromFile(apk));
            req.setMimeType("application/vnd.android.package-archive");
            final DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
            final long id = dm.enqueue(req);

            if (dlReceiver != null) {
                try { ctx.unregisterReceiver(dlReceiver); } catch (Exception ignored) {}
            }
            dlReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context c, Intent intent) {
                    long done = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                    if (done != id) return;
                    try { c.unregisterReceiver(this); } catch (Exception ignored) {}
                    dlReceiver = null;
                    try {
                        Uri uri = FileProvider.getUriForFile(c, c.getPackageName() + ".glystvfiles", apk);
                        Intent inst = new Intent(Intent.ACTION_VIEW);
                        inst.setDataAndType(uri, "application/vnd.android.package-archive");
                        inst.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                        c.startActivity(inst);
                    } catch (Exception e) {
                        // si falla, abrir la descarga en el navegador
                        try {
                            Intent b = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                            b.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            c.startActivity(b);
                        } catch (Exception ignored) {}
                    }
                }
            };
            ContextCompat.registerReceiver(ctx, dlReceiver,
                    new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
                    ContextCompat.RECEIVER_EXPORTED);

            JSObject r = new JSObject();
            r.put("status", "descargando");
            call.resolve(r);
        } catch (Exception e) {
            call.reject("error: " + e.getMessage());
        }
    }
                            }
