package com.keeguard.autofill

import android.content.Context
import com.keeguard.autofill.classifier.PackageExclusionGuard
import com.keeguard.autofill.handler.SaveRequestHandler
import com.keeguard.autofill.matcher.CredentialMatcher
import com.keeguard.autofill.matcher.VaultRepository
import com.keeguard.autofill.parser.AssistStructureParser
import com.keeguard.autofill.suggestion.CategoryRepository
import com.keeguard.autofill.suggestion.SmartCategorySuggester

/**
 * Service locator for the autofill module.
 * Wires all modules together. The VaultRepository and CategoryRepository
 * implementations must be provided by the app's main data layer.
 */
class AutofillServiceLocator private constructor(
    val exclusionGuard: PackageExclusionGuard,
    val structureParser: AssistStructureParser,
    val credentialMatcher: CredentialMatcher,
    val saveRequestHandler: SaveRequestHandler,
    val categorySuggester: SmartCategorySuggester
) {
    companion object {
        @Volatile private var instance: AutofillServiceLocator? = null

        fun getInstance(context: Context): AutofillServiceLocator =
            instance ?: throw IllegalStateException(
                "AutofillServiceLocator not initialized. Call initialize() in Application.onCreate()"
            )

        fun initialize(
            context: Context,
            vaultRepository: VaultRepository,
            categoryRepository: CategoryRepository
        ) {
            val exclusionGuard = PackageExclusionGuard()
            val structureParser = AssistStructureParser()
            val credentialMatcher = CredentialMatcher(vaultRepository)
            val categorySuggester = SmartCategorySuggester(context, categoryRepository)
            val saveRequestHandler = SaveRequestHandler(
                context, credentialMatcher, vaultRepository, categorySuggester
            )

            instance = AutofillServiceLocator(
                exclusionGuard, structureParser, credentialMatcher, saveRequestHandler, categorySuggester
            )
        }
    }
}
