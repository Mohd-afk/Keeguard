package com.mohdj.securevault.autofill.parser

import android.app.assist.AssistStructure
import android.app.assist.AssistStructure.ViewNode
import android.text.InputType
import android.view.View
import android.view.autofill.AutofillId
import android.view.autofill.AutofillValue
import com.mohdj.securevault.autofill.SecureLogger

/**
 * AssistStructureParser
 *
 * Traverses the Android AssistStructure ViewNode tree to extract all
 * information needed to understand the form being filled.
 * Includes depth protection and node count validation to prevent OEM crashes or stack overflows.
 */
class AssistStructureParser {

    private val usernameKeywords = setOf("user","username","email","e-mail","login","account","identifier","phone","mobile","uname","userid")
    private val passwordKeywords = setOf("password","passwd","pass","secret","pin","pwd","pswd")
    private val newPasswordKeywords = setOf("new","create","confirm","repeat","retype")
    private val searchKeywords = setOf("search","query","filter","find","q")

    companion object {
        private const val MAX_TREE_DEPTH = 30
        private const val MAX_NODE_COUNT = 1000
    }

    fun parse(structure: AssistStructure): ParsedForm {
        val packageName = structure.activityComponent.packageName
        val fields = mutableListOf<ParsedField>()
        var detectedDomain: String? = null
        val nodeCounter = IntArray(1) { 0 }

        for (i in 0 until structure.windowNodeCount) {
            if (nodeCounter[0] >= MAX_NODE_COUNT) break
            val win = structure.getWindowNodeAt(i)
            val domain = win.title?.toString()?.extractDomain()
            if (domain != null && detectedDomain == null) detectedDomain = domain
            traverseNode(win.rootViewNode, fields, 0, nodeCounter)
        }

        val canonical = detectedDomain ?: packageName
        return buildParsedForm(fields, packageName, detectedDomain, canonical)
    }

    fun extractSavedValues(structure: AssistStructure, parsedForm: ParsedForm): Pair<String?, String?> {
        val nodeValues = mutableMapOf<AutofillId, AutofillValue?>()
        val nodeCounter = IntArray(1) { 0 }
        
        for (i in 0 until structure.windowNodeCount) {
            if (nodeCounter[0] >= MAX_NODE_COUNT) break
            collectValues(structure.getWindowNodeAt(i).rootViewNode, nodeValues, 0, nodeCounter)
        }
        
        val username = parsedForm.usernameField?.let { nodeValues[it.autofillId]?.textValue?.toString() }
            ?: parsedForm.emailField?.let { nodeValues[it.autofillId]?.textValue?.toString() }
        val password = parsedForm.passwordField?.let { nodeValues[it.autofillId]?.textValue?.toString() }
            ?: parsedForm.newPasswordField?.let { nodeValues[it.autofillId]?.textValue?.toString() }
            
        return Pair(username, password)
    }

    private fun traverseNode(
        node: ViewNode, 
        fields: MutableList<ParsedField>, 
        depth: Int, 
        nodeCounter: IntArray
    ) {
        if (depth > MAX_TREE_DEPTH || nodeCounter[0] >= MAX_NODE_COUNT) return
        nodeCounter[0]++

        val autofillId = node.autofillId ?: run {
            recurse(node, fields, depth + 1, nodeCounter)
            return
        }
        
        val fieldType = classifyNode(node)
        if (fieldType != FieldType.UNKNOWN) {
            fields.add(ParsedField(
                autofillId = autofillId,
                fieldType = fieldType,
                currentValue = node.autofillValue,
                htmlInputType = node.htmlInfo?.attributes?.firstOrNull { it.first == "type" }?.second,
                autofillHints = node.autofillHints?.toList() ?: emptyList()
            ))
        }
        recurse(node, fields, depth + 1, nodeCounter)
    }

    private fun recurse(
        node: ViewNode, 
        fields: MutableList<ParsedField>, 
        depth: Int, 
        nodeCounter: IntArray
    ) {
        for (i in 0 until node.childCount) {
            if (nodeCounter[0] >= MAX_NODE_COUNT) break
            traverseNode(node.getChildAt(i), fields, depth, nodeCounter)
        }
    }

    private fun collectValues(
        node: ViewNode, 
        map: MutableMap<AutofillId, AutofillValue?>, 
        depth: Int, 
        nodeCounter: IntArray
    ) {
        if (depth > MAX_TREE_DEPTH || nodeCounter[0] >= MAX_NODE_COUNT) return
        nodeCounter[0]++

        node.autofillId?.let { map[it] = node.autofillValue }
        for (i in 0 until node.childCount) {
            if (nodeCounter[0] >= MAX_NODE_COUNT) break
            collectValues(node.getChildAt(i), map, depth + 1, nodeCounter)
        }
    }

    private fun classifyNode(node: ViewNode): FieldType {
        val hints = node.autofillHints?.toList() ?: emptyList()

        // Priority 1: autofillHints (most authoritative signal)
        if (hints.any { it.contains(View.AUTOFILL_HINT_USERNAME, true) }) return FieldType.USERNAME
        if (hints.any { it.contains(View.AUTOFILL_HINT_EMAIL_ADDRESS, true) }) return FieldType.EMAIL
        if (hints.any { it.contains("newPassword", true) }) return FieldType.NEW_PASSWORD
        if (hints.any { it.contains(View.AUTOFILL_HINT_PASSWORD, true) }) return FieldType.PASSWORD
        if (hints.any { it.contains("otp", true) || it.contains("oneTimeCode", true) }) return FieldType.OTP

        // Priority 2: inputType flags
        val inputClass = node.inputType and InputType.TYPE_MASK_CLASS
        val inputVar   = node.inputType and InputType.TYPE_MASK_VARIATION
        if (inputClass == InputType.TYPE_CLASS_TEXT) {
            when (inputVar) {
                InputType.TYPE_TEXT_VARIATION_PASSWORD,
                InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD,
                InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD -> {
                    val combo = "${node.idEntry ?: ""} ${node.hint ?: ""}".lowercase()
                    return if (newPasswordKeywords.any { combo.contains(it) }) FieldType.NEW_PASSWORD else FieldType.PASSWORD
                }
                InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS,
                InputType.TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS -> return FieldType.EMAIL
            }
        }
        if (inputClass == InputType.TYPE_CLASS_NUMBER && inputVar == InputType.TYPE_NUMBER_VARIATION_PASSWORD)
            return FieldType.PASSWORD

        // Priority 3: HTML attributes (browser WebView)
        val htmlType = node.htmlInfo?.attributes?.firstOrNull { it.first == "type" }?.second
        when (htmlType) {
            "password" -> {
                val id = (node.idEntry ?: "").lowercase()
                return if (newPasswordKeywords.any { id.contains(it) }) FieldType.NEW_PASSWORD else FieldType.PASSWORD
            }
            "email" -> return FieldType.EMAIL
            "tel"   -> return FieldType.USERNAME
            "search"-> return FieldType.SEARCH
        }

        // Priority 4: keyword fallback
        val combined = "${node.idEntry ?: ""} ${node.hint ?: ""} ${node.contentDescription ?: ""}".lowercase()
        if (searchKeywords.any { combined.contains(it) }) return FieldType.SEARCH
        if (passwordKeywords.any { combined.contains(it) })
            return if (newPasswordKeywords.any { combined.contains(it) }) FieldType.NEW_PASSWORD else FieldType.PASSWORD
        if (usernameKeywords.any { combined.contains(it) }) {
            return if (combined.contains("email")) FieldType.EMAIL else FieldType.USERNAME
        }

        return FieldType.UNKNOWN
    }

    private fun buildParsedForm(
        fields: List<ParsedField>, packageName: String, webDomain: String?, canonical: String
    ): ParsedForm {
        val userField = fields.firstOrNull { it.fieldType == FieldType.USERNAME }
        val emailField = fields.firstOrNull { it.fieldType == FieldType.EMAIL }
        val passField = fields.firstOrNull { it.fieldType == FieldType.PASSWORD }
        val newPassField = fields.firstOrNull { it.fieldType == FieldType.NEW_PASSWORD }
        val confirmField = fields.filter { it.fieldType == FieldType.NEW_PASSWORD }.getOrNull(1)

        val formType = when {
            passField == null && newPassField == null && fields.any { it.fieldType == FieldType.SEARCH } -> FormType.SEARCH
            passField != null && newPassField != null && confirmField != null -> FormType.CHANGE_PASSWORD
            passField != null && newPassField != null -> FormType.REGISTRATION
            passField != null -> FormType.LOGIN
            else -> FormType.UNKNOWN
        }

        return ParsedForm(
            formType = formType,
            usernameField = userField,
            emailField = emailField,
            passwordField = passField,
            newPasswordField = newPassField,
            confirmPasswordField = confirmField,
            sourcePackage = packageName,
            webDomain = webDomain,
            canonicalIdentifier = canonical
        )
    }

    private fun String.extractDomain(): String? = try {
        val c = this.lowercase()
            .removePrefix("https://").removePrefix("http://").removePrefix("www.")
            .split("/").first().split("?").first()
        c.split(".").let { p -> if (p.size >= 2) "${p[p.size-2]}.${p.last()}" else c }
    } catch (e: Exception) { null }
}
