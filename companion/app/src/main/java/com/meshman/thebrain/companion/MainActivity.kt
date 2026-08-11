package com.meshman.thebrain.companion

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContract
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.ZoneId

/**
 * One screen, four states: not signed in → signed in without Health
 * Connect permission → ready → synced. Every step is something Jay does
 * once; after that the WorkManager job is the whole app.
 */
class MainActivity : ComponentActivity() {

    private lateinit var store: AuthStore
    private lateinit var reader: HealthReader
    private lateinit var status: TextView
    private lateinit var email: EditText

    @Suppress("UNCHECKED_CAST")
    private val askPermissions = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract()
            as ActivityResultContract<Set<String>, Set<String>>
    ) { refresh() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        store = AuthStore(this)
        reader = HealthReader(this)
        status = findViewById(R.id.status)
        email = findViewById(R.id.email)

        findViewById<Button>(R.id.send_link).setOnClickListener {
            val addr = email.text.toString().trim()
            if (addr.isEmpty()) return@setOnClickListener
            setStatus("Sending the magic link…")
            lifecycleScope.launch(Dispatchers.IO) {
                val r = Supabase(store).requestMagicLink(addr)
                withContext(Dispatchers.Main) {
                    setStatus(
                        if (r.isSuccess)
                            "Link sent. Open the email ON THIS PHONE and tap it — it comes straight back here."
                        else
                            "Couldn't request the link: ${r.exceptionOrNull()?.message}"
                    )
                }
            }
        }

        findViewById<Button>(R.id.grant).setOnClickListener {
            askPermissions.launch(reader.permissions)
        }

        findViewById<Button>(R.id.sync_now).setOnClickListener {
            setStatus("Syncing the last 7 days…")
            lifecycleScope.launch(Dispatchers.IO) {
                try {
                    val agg = reader.read(windowDays = 7, zone = ZoneId.systemDefault())
                    val days = agg.build()
                    if (days.isNotEmpty()) {
                        Supabase(store).upsertHealthDays(Payload.toJson(days)).getOrThrow()
                    }
                    SyncLog.record(this@MainActivity, days.size)
                    withContext(Dispatchers.Main) { refresh() }
                } catch (e: Exception) {
                    withContext(Dispatchers.Main) { setStatus("Sync failed: ${e.message}") }
                }
            }
        }

        SyncWorker.schedule(this)
        handleLink(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleLink(intent)
    }

    /** thebrain://auth#access_token=…&refresh_token=… — the magic link landing. */
    private fun handleLink(intent: Intent?) {
        val data: Uri = intent?.data ?: return refresh()
        if (data.scheme != "thebrain") return refresh()
        val frag = data.fragment ?: ""
        val params = frag.split("&").mapNotNull {
            val i = it.indexOf("=")
            if (i == -1) null else it.take(i) to Uri.decode(it.substring(i + 1))
        }.toMap()
        val access = params["access_token"]
        val refreshTok = params["refresh_token"]
        if (access != null && refreshTok != null) {
            Supabase(store).acceptTokens(access, refreshTok)
            setStatus("Signed in.")
        } else if (params.containsKey("error_description")) {
            setStatus("Sign-in failed: ${params["error_description"]}")
        }
        refresh()
    }

    private fun refresh() {
        lifecycleScope.launch {
            val signedIn = store.signedIn()
            val hcAvailable = reader.available()
            val granted = if (hcAvailable) withContext(Dispatchers.IO) { reader.granted() } else emptySet()
            val line = when {
                !signedIn -> "Step 1 — sign in with your email."
                !hcAvailable -> "Signed in. Health Connect is not available on this device."
                granted.isEmpty() -> "Signed in. Step 2 — grant Health Connect access."
                else -> "Ready. ${granted.size} of ${reader.permissions.size} permissions granted.\n" +
                    SyncLog.lastLine(this@MainActivity) +
                    "\nSyncs itself twice a day; the button below is for impatience."
            }
            setStatus(line)
        }
    }

    private fun setStatus(text: String) {
        status.text = text
    }
}
