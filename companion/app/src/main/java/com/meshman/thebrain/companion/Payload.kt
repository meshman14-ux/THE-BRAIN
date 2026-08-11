package com.meshman.thebrain.companion

import java.time.LocalDate

/**
 * The upsert body, built by hand so it is pure and JVM-testable.
 *
 * Each row carries `on_date`, `source: "health_connect"` and ONLY the
 * fields that were observed — the same no-clobber guarantee the web
 * importer holds: PostgREST's merge-duplicates SETs the provided columns
 * and leaves the rest, so a hand-typed figure survives a sync that did
 * not bring that field. A null is never sent; absence IS the statement.
 */
object Payload {

    fun toJson(days: Map<LocalDate, Map<String, Any>>): String {
        val rows = days.entries
            .sortedBy { it.key }
            .filter { it.value.isNotEmpty() }
            .map { (date, fields) ->
                val parts = mutableListOf(
                    "\"on_date\":\"$date\"",
                    "\"source\":\"health_connect\""
                )
                for ((k, v) in fields.entries.sortedBy { it.key }) {
                    parts.add("\"$k\":${encode(v)}")
                }
                "{${parts.joinToString(",")}}"
            }
        return "[${rows.joinToString(",")}]"
    }

    private fun encode(v: Any): String = when (v) {
        is Long, is Int -> v.toString()
        is Double ->
            // 7.0 must ship as 7, not "7.0" — and never in scientific notation.
            if (v == Math.floor(v) && !v.isInfinite()) v.toLong().toString()
            else v.toString()
        is Boolean -> v.toString()
        else -> "\"${v.toString().replace("\\", "\\\\").replace("\"", "\\\"")}\""
    }
}
