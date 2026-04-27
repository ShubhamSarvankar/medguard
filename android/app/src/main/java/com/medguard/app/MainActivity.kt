package com.medguard.app

import android.os.Bundle
import android.view.MotionEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.lifecycleScope
import com.medguard.app.domain.repository.AuthRepository
import com.medguard.app.ui.SessionViewModel
import com.medguard.app.ui.navigation.NavGraph
import com.medguard.app.ui.navigation.NavGraphCallbacks
import com.medguard.app.ui.theme.MedGuardTheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    private val sessionViewModel: SessionViewModel by viewModels()
    private var onSessionExpired: (() -> Unit)? = null

    @Inject
    lateinit var authRepository: AuthRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        sessionViewModel.navigateToAuth
            .onEach { onSessionExpired?.invoke() }
            .launchIn(lifecycleScope)

        setContent {
            MedGuardTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    val currentUser by authRepository.currentUser.collectAsState(initial = null)

                    NavGraph(
                        callbacks = NavGraphCallbacks(
                            onSessionExpiredSinkReady = { sink -> onSessionExpired = sink },
                            ownerUid = currentUser?.uid ?: "",
                        )
                    )
                }
            }
        }
    }

    override fun dispatchTouchEvent(ev: MotionEvent?): Boolean {
        sessionViewModel.recordActivity()
        return super.dispatchTouchEvent(ev)
    }
}