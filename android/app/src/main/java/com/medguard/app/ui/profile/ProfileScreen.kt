package com.medguard.app.ui.profile

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.medguard.app.domain.model.AuditEntry
import com.medguard.app.domain.model.CareCircleMember
import com.medguard.app.domain.model.User
import com.medguard.app.domain.model.UserRole
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private const val DELETE_CONFIRM_PHRASE = "DELETE MY DATA"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    onNavigateBack: () -> Unit,
    onNavigateToRecord: (recordId: String) -> Unit = {},
    viewModel: ProfileViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val action by viewModel.action.collectAsStateWithLifecycle()

    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    var showInviteDialog by remember { mutableStateOf(false) }
    var showDeleteDialog by remember { mutableStateOf(false) }
    var deleteDone by remember { mutableStateOf(false) }

    LaunchedEffect(action) {
        when (val a = action) {
            is ProfileAction.Success -> {
                if (a.message.startsWith("Deletion")) deleteDone = true
                scope.launch { snackbarHostState.showSnackbar(a.message) }
                viewModel.clearAction()
            }
            is ProfileAction.Error -> {
                scope.launch { snackbarHostState.showSnackbar(a.message) }
                viewModel.clearAction()
            }
            else -> Unit
        }
    }

    if (showInviteDialog) {
        InviteDialog(
            onDismiss = { showInviteDialog = false },
            onConfirm = { email, role ->
                showInviteDialog = false
                viewModel.inviteToCareCircle(email, role)
            }
        )
    }

    if (showDeleteDialog) {
        DeleteAccountDialog(
            onDismiss = { showDeleteDialog = false },
            onConfirm = { phrase ->
                showDeleteDialog = false
                viewModel.deleteUserData(phrase)
            }
        )
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text("Profile") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = viewModel::refresh) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                },
            )
        },
    ) { innerPadding ->
        when {
            state.isLoading -> Box(
                modifier = Modifier.fillMaxSize().padding(innerPadding),
                contentAlignment = Alignment.Center,
            ) { CircularProgressIndicator() }

            state.error != null -> Box(
                modifier = Modifier.fillMaxSize().padding(innerPadding),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = state.error!!,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }

            else -> ProfileContent(
                profile = state.profile,
                careCircle = state.careCircle,
                recentActivity = state.recentActivity,
                deleteDone = deleteDone,
                actionPending = action is ProfileAction.Pending,
                onInviteClick = { showInviteDialog = true },
                onRemoveMember = viewModel::removeCareCircleMember,
                onDeleteClick = { showDeleteDialog = true },
                onAuditEntryClick = { entry ->
                    entry.recordId?.let { onNavigateToRecord(it) }
                },
                modifier = Modifier.padding(innerPadding),
            )
        }
    }
}

@Composable
private fun ProfileContent(
    profile: User?,
    careCircle: List<CareCircleMember>,
    recentActivity: List<AuditEntry>,
    deleteDone: Boolean,
    actionPending: Boolean,
    onInviteClick: () -> Unit,
    onRemoveMember: (String) -> Unit,
    onDeleteClick: () -> Unit,
    onAuditEntryClick: (AuditEntry) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            SectionHeader("Profile")
            Card(
                modifier = Modifier.fillMaxWidth(),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    ProfileRow("Name", profile?.displayName ?: "—")
                    ProfileRow("Email", profile?.email ?: "—")
                    ProfileRow("Role", profile?.role?.name?.lowercase()?.replaceFirstChar { it.uppercase() } ?: "—")
                }
            }
        }

        if (profile?.role == UserRole.PATIENT) {
            item {
                Spacer(modifier = Modifier.height(4.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Care Circle", style = MaterialTheme.typography.titleMedium)
                    IconButton(onClick = onInviteClick, enabled = !actionPending) {
                        Icon(Icons.Default.PersonAdd, contentDescription = "Invite member")
                    }
                }
            }

            if (careCircle.isEmpty()) {
                item {
                    Text(
                        text = "No care circle members yet.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                items(careCircle, key = { it.uid }) { member ->
                    CareCircleMemberCard(
                        member = member,
                        onRemove = { onRemoveMember(member.uid) },
                        enabled = !actionPending,
                    )
                }
            }
        }

        item {
            Spacer(modifier = Modifier.height(4.dp))
            SectionHeader("Recent Activity")
        }

        if (recentActivity.isEmpty()) {
            item {
                Text(
                    text = "No recent activity.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            items(recentActivity, key = { it.entryId }) { entry ->
                AuditEntryCard(
                    entry = entry,
                    onClick = { onAuditEntryClick(entry) },
                )
            }
        }

        item {
            Spacer(modifier = Modifier.height(8.dp))
            HorizontalDivider()
            Spacer(modifier = Modifier.height(8.dp))
            Text("Danger Zone", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.error)
            Spacer(modifier = Modifier.height(8.dp))
            if (deleteDone) {
                Text(
                    text = "Your deletion request has been submitted. Your account will be deleted in 30 days.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                Button(
                    onClick = onDeleteClick,
                    enabled = !actionPending,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.error,
                    ),
                ) {
                    Text("Delete My Account")
                }
            }
        }
    }
}

@Composable
private fun AuditEntryCard(
    entry: AuditEntry,
    onClick: () -> Unit,
) {
    val hasRecord = entry.recordId != null
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (hasRecord) Modifier.clickable(onClick = onClick) else Modifier),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = formatActionType(entry.actionType),
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(
                    text = formatTimestamp(entry.timestampMillis),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (hasRecord) {
                Text(
                    text = "View",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}

private fun formatActionType(actionType: String): String =
    actionType
        .replace(".", " \u2022 ")
        .replaceFirstChar { it.uppercase() }

private fun formatTimestamp(millis: Long): String =
    SimpleDateFormat("MMM d, yyyy h:mm a", Locale.getDefault()).format(Date(millis))

@Composable
private fun CareCircleMemberCard(
    member: CareCircleMember,
    onRemove: () -> Unit,
    enabled: Boolean,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(member.displayName, style = MaterialTheme.typography.bodyMedium)
                Text(
                    member.role,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            IconButton(onClick = onRemove, enabled = enabled) {
                Icon(Icons.Default.Close, contentDescription = "Remove member")
            }
        }
    }
}

@Composable
private fun InviteDialog(
    onDismiss: () -> Unit,
    onConfirm: (email: String, role: String) -> Unit,
) {
    var email by remember { mutableStateOf("") }
    var role by remember { mutableStateOf("caretaker") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Invite to care circle") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("Email address") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("caretaker", "clinician").forEach { r ->
                        TextButton(
                            onClick = { role = r },
                            colors = if (role == r)
                                ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.primary)
                            else
                                ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.onSurfaceVariant),
                        ) { Text(r.replaceFirstChar { it.uppercase() }) }
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = { if (email.isNotBlank()) onConfirm(email.trim(), role) }) {
                Text("Send invite")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

@Composable
private fun DeleteAccountDialog(
    onDismiss: () -> Unit,
    onConfirm: (phrase: String) -> Unit,
) {
    var phrase by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Delete account", color = MaterialTheme.colorScheme.error) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "This will permanently delete all your records after a 30-day waiting period.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(
                    "Type \"$DELETE_CONFIRM_PHRASE\" to confirm.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                OutlinedTextField(
                    value = phrase,
                    onValueChange = { phrase = it },
                    placeholder = { Text(DELETE_CONFIRM_PHRASE) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(phrase) },
                enabled = phrase == DELETE_CONFIRM_PHRASE,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error,
                ),
            ) { Text("Delete") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

@Composable
private fun SectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleMedium,
        modifier = Modifier.padding(bottom = 8.dp),
    )
}

@Composable
private fun ProfileRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(text = value, style = MaterialTheme.typography.bodyMedium)
    }
}