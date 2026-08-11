package com.meshman.thebrain.companion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class PayloadTest {

    @Test
    fun `a row carries only what was observed — the no-clobber guarantee`() {
        val json = Payload.toJson(
            mapOf(LocalDate.of(2026, 8, 1) to mapOf<String, Any>("weight_kg" to 86.1))
        )
        assertEquals(
            """[{"on_date":"2026-08-01","source":"health_connect","weight_kg":86.1}]""",
            json
        )
        assertFalse(json.contains("steps"))
        assertFalse(json.contains("null"))
    }

    @Test
    fun `whole doubles ship as integers`() {
        val json = Payload.toJson(
            mapOf(LocalDate.of(2026, 8, 2) to mapOf<String, Any>("sleep_hours" to 8.0))
        )
        assertTrue(json.contains("\"sleep_hours\":8"))
        assertFalse(json.contains("8.0"))
    }

    @Test
    fun `rows come out date-ordered and empty days are dropped`() {
        val json = Payload.toJson(
            mapOf(
                LocalDate.of(2026, 8, 3) to mapOf<String, Any>("steps" to 512L),
                LocalDate.of(2026, 8, 1) to mapOf<String, Any>("steps" to 8410L),
                LocalDate.of(2026, 8, 2) to mapOf(),
            )
        )
        assertEquals(
            """[{"on_date":"2026-08-01","source":"health_connect","steps":8410},""" +
                """{"on_date":"2026-08-03","source":"health_connect","steps":512}]""",
            json
        )
    }
}
