package com.mohdj.securevault.autofill

import android.content.Context
import com.mohdj.securevault.autofill.classifier.PackageExclusionGuard
import com.mohdj.securevault.autofill.handler.SaveRequestHandler
import com.mohdj.securevault.autofill.matcher.CredentialMatcher
import com.mohdj.securevault.autofill.matcher.VaultRepository
import com.mohdj.securevault.autofill.parser.AssistStructureParser
import com.mohdj.securevault.autofill.suggestion.CategoryRepository
import com.mohdj.securevault.autofill.suggestion.SmartCategorySuggester

/**
 * Service locator for the autofill module.
 * Wires all modules together. The VaultRepository and CategoryRepository
 * implementations are provided by the app's main data layer.
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

        fun getInstance(context: Context): AutofillServiceLocator {
            initializeIfNeeded(context)
            return instance!!
        }

        fun initializeIfNeeded(context: Context) {
            if (instance == null) {
                synchronized(this) {
                    if (instance == null) {
                        val appCtx = context.applicationContext
                        val dbRepo = com.mohdj.securevault.vault.VaultRepository(appCtx)
                        val vaultAdapter = AutofillVaultRepositoryAdapter(dbRepo)
                        val categoryAdapter = AutofillCategoryRepositoryAdapter()
                        initialize(appCtx, vaultAdapter, categoryAdapter)
                    }
                }
            }
        }

        fun initialize(
            context: Context,
            vaultRepository: VaultRepository,
            categoryRepository: CategoryRepository
        ) {
            val exclusionGuard = PackageExclusionGuard()
            val structureParser = AssistStructureParser()
            val credentialMatcher = CredentialMatcher(vaultRepository, DomainMatcher(context))
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
