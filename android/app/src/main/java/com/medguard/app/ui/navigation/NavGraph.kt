package com.medguard.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.medguard.app.ui.auth.AuthScreen
import com.medguard.app.ui.profile.ProfileScreen
import com.medguard.app.ui.records.RecordDetailScreen
import com.medguard.app.ui.records.RecordEditScreen
import com.medguard.app.ui.records.RecordsScreen
import com.medguard.app.ui.share.ShareScreen

data class NavGraphCallbacks(
    val onSessionExpiredSinkReady: (sink: () -> Unit) -> Unit,
    val ownerUid: String,
)

@Composable
fun NavGraph(callbacks: NavGraphCallbacks) {
    val navController = rememberNavController()

    LaunchedEffect(Unit) {
        callbacks.onSessionExpiredSinkReady {
            navController.navigate(Routes.AUTH) {
                popUpTo(0) { inclusive = true }
            }
        }
    }

    NavHost(
        navController = navController,
        startDestination = Routes.AUTH,
    ) {
        composable(Routes.AUTH) {
            AuthScreen(
                onAuthenticated = {
                    navController.navigate(Routes.RECORDS) {
                        popUpTo(Routes.AUTH) { inclusive = true }
                    }
                }
            )
        }

        composable(Routes.RECORDS) {
            RecordsScreen(
                onNavigateToDetail = { recordId ->
                    navController.navigate(Routes.recordDetail(recordId))
                },
                onNavigateToCreate = {
                    navController.navigate(Routes.recordEdit("new"))
                },
                onNavigateToProfile = {
                    navController.navigate(Routes.PROFILE)
                },
            )
        }

        composable(
            route = Routes.RECORD_DETAIL,
            arguments = listOf(navArgument("recordId") { type = NavType.StringType }),
        ) { backStackEntry ->
            val recordId = backStackEntry.arguments?.getString("recordId") ?: return@composable
            RecordDetailScreen(
                recordId = recordId,
                onNavigateBack = { navController.popBackStack() },
                onNavigateToEdit = { id ->
                    navController.navigate(Routes.recordEdit(id))
                },
                onNavigateToShare = { id ->
                    navController.navigate(Routes.share(id))
                },
            )
        }

        composable(
            route = Routes.RECORD_EDIT,
            arguments = listOf(navArgument("recordId") { type = NavType.StringType }),
        ) { backStackEntry ->
            val recordId = backStackEntry.arguments?.getString("recordId") ?: return@composable
            RecordEditScreen(
                recordId = recordId,
                ownerUid = callbacks.ownerUid,
                onNavigateBack = { navController.popBackStack() },
            )
        }

        composable(
            route = Routes.SHARE,
            arguments = listOf(navArgument("recordId") { type = NavType.StringType }),
        ) { backStackEntry ->
            val recordId = backStackEntry.arguments?.getString("recordId") ?: return@composable
            ShareScreen(
                recordId = recordId,
                onNavigateBack = { navController.popBackStack() },
                onShareAccepted = {
                    navController.navigate(Routes.RECORDS) {
                        popUpTo(Routes.RECORDS) { inclusive = false }
                    }
                },
            )
        }

        composable(Routes.PROFILE) {
            ProfileScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateToRecord = { recordId ->
                    navController.navigate(Routes.recordDetail(recordId))
                },
            )
        }
    }
}

object Routes {
    const val AUTH = "auth"
    const val RECORDS = "records"
    const val RECORD_DETAIL = "records/{recordId}"
    const val RECORD_EDIT = "records/{recordId}/edit"
    const val SHARE = "share/{recordId}"
    const val PROFILE = "profile"

    fun recordDetail(recordId: String) = "records/$recordId"
    fun recordEdit(recordId: String) = "records/$recordId/edit"
    fun share(recordId: String) = "share/$recordId"
}