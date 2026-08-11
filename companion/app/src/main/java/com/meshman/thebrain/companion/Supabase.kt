package com.meshman.thebrain.companion

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/**
 * Supabase over plain HTTP — GoTrue for auth, PostgREST for the upsert.
 *
 * No SDK on purpose: the app makes exactly four calls, and every one of
 * them runs as JAY, through his own session, against RLS. There is no
 * service key anywhere in this app, the same rule the calendar sync holds
 * on the web side (CLAUDE.md §A3 decision 8).
 */
class Supabase(private val store: AuthStore) {

    private val http = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private val base = BuildConfig.SUPABASE_URL
    private val anon = BuildConfig.SUPABASE_ANON_KEY
    private val json = "application/json; charset=utf-8".toMediaType()

    /**
     * Ask GoTrue to email the magic link. `redirect_to` is the app's own
     * scheme, which must be on the Supabase redirect allow-list —
     * `thebrain://auth` — exactly as the localhost wildcard had to be
     * added for local web sign-in. (Kotlin block comments nest, so the
     * literal slash-star-star form of that wildcard cannot be written
     * here.) `create_user` false: signups are off, Jay's account exists.
     */
    fun requestMagicLink(email: String): Result<Unit> = runCatching {
        val body = """{"email":${quote(email)},"create_user":false}"""
        val req = Request.Builder()
            .url("$base/auth/v1/otp?redirect_to=thebrain%3A%2F%2Fauth")
            .header("apikey", anon)
            .post(body.toRequestBody(json))
            .build()
        http.newCall(req).execute().use { r ->
            if (!r.isSuccessful) error("magic link request failed (${r.code})")
        }
    }

    /**
     * The link lands as thebrain://auth#access_token=…&refresh_token=… —
     * the fragment is parsed by MainActivity and handed here to persist.
     */
    fun acceptTokens(accessToken: String, refreshToken: String) {
        store.save(accessToken, refreshToken)
    }

    /**
     * A usable access token, refreshed when needed. GoTrue rotates the
     * refresh token on every use; losing the rotation would sign the app
     * out, so the new pair is stored before anything else happens.
     */
    fun accessToken(): Result<String> = runCatching {
        val held = store.accessToken()
        val refresh = store.refreshToken() ?: error("not signed in")
        // Access tokens live an hour; refresh unconditionally when close.
        if (held != null && !store.expiresSoon()) return@runCatching held
        val body = """{"refresh_token":${quote(refresh)}}"""
        val req = Request.Builder()
            .url("$base/auth/v1/token?grant_type=refresh_token")
            .header("apikey", anon)
            .post(body.toRequestBody(json))
            .build()
        http.newCall(req).execute().use { r ->
            val text = r.body?.string() ?: ""
            if (!r.isSuccessful) {
                if (r.code in 400..403) store.clear() // session truly dead
                error("refresh failed (${r.code})")
            }
            val access = extract(text, "access_token") ?: error("no access token")
            val rotated = extract(text, "refresh_token") ?: refresh
            store.save(access, rotated)
            access
        }
    }

    /**
     * The one write: rows into `health_days`, merge on (user_id, on_date),
     * SETting only the columns each row carries — the no-clobber guarantee.
     * `user_id` is not sent; the column's `default auth.uid()` fills it
     * from the very session this call runs as.
     */
    fun upsertHealthDays(bodyJson: String): Result<Int> = runCatching {
        val token = accessToken().getOrThrow()
        val req = Request.Builder()
            .url("$base/rest/v1/health_days?on_conflict=user_id,on_date")
            .header("apikey", anon)
            .header("Authorization", "Bearer $token")
            .header("Prefer", "resolution=merge-duplicates,return=minimal")
            .post(bodyJson.toRequestBody(json))
            .build()
        http.newCall(req).execute().use { r ->
            if (!r.isSuccessful) error("upsert failed (${r.code}): ${r.body?.string()?.take(200)}")
            r.code
        }
    }

    private fun quote(s: String) =
        "\"${s.replace("\\", "\\\\").replace("\"", "\\\"")}\""

    /** Enough JSON reading for two known string fields — no parser dependency. */
    private fun extract(json: String, field: String): String? {
        val m = Regex("\"$field\"\\s*:\\s*\"([^\"]+)\"").find(json)
        return m?.groupValues?.get(1)
    }
}
