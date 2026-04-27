package com.medguard.app.ui.records

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.medguard.app.data.local.db.DiagnosisEntity
import com.medguard.app.data.local.db.MedicationEntity
import com.medguard.app.data.local.db.RecordWithRelations
import com.medguard.app.data.local.db.VitalsEntity
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecordDetailScreen(
    recordId: String,
    onNavigateBack: () -> Unit,
    onNavigateToEdit: (recordId: String) -> Unit,
    onNavigateToShare: (recordId: String) -> Unit = {},
    viewModel: RecordsViewModel = hiltViewModel(),
) {
    val detailState by viewModel.detailUiState.collectAsStateWithLifecycle()
    val editState by viewModel.editUiState.collectAsStateWithLifecycle()
    var showDeleteDialog by remember { mutableStateOf(false) }

    LaunchedEffect(recordId) {
        viewModel.loadRecord(recordId)
    }

    LaunchedEffect(editState) {
        if (editState is RecordEditUiState.Deleted) {
            viewModel.resetEditState()
            onNavigateBack()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    val title = (detailState as? RecordDetailUiState.Success)
                        ?.record?.record?.title ?: "Record"
                    Text(text = title)
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (detailState is RecordDetailUiState.Success) {
                        IconButton(onClick = { onNavigateToShare(recordId) }) {
                            Icon(Icons.Default.Share, contentDescription = "Share")
                        }
                        IconButton(onClick = { onNavigateToEdit(recordId) }) {
                            Icon(Icons.Default.Edit, contentDescription = "Edit")
                        }
                        IconButton(onClick = { showDeleteDialog = true }) {
                            Icon(
                                Icons.Default.Delete,
                                contentDescription = "Delete",
                                tint = MaterialTheme.colorScheme.error,
                            )
                        }
                    }
                },
            )
        },
    ) { innerPadding ->
        Box(modifier = Modifier.padding(innerPadding)) {
            when (val state = detailState) {
                is RecordDetailUiState.Loading -> {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
                is RecordDetailUiState.NotFound -> {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("Record not found.", color = MaterialTheme.colorScheme.error)
                    }
                }
                is RecordDetailUiState.Success -> {
                    RecordDetailContent(rwr = state.record)
                }
            }

            if (editState is RecordEditUiState.Deleting) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
        }
    }

    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text("Delete record?") },
            text = { Text("This will permanently remove the record and all its attachments. This cannot be undone.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteDialog = false
                        viewModel.deleteRecord(recordId)
                    },
                ) {
                    Text("Delete", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) {
                    Text("Cancel")
                }
            },
        )
    }
}

@Composable
private fun RecordDetailContent(rwr: RecordWithRelations) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        DetailSection(title = "Visit Date") {
            Text(
                text = formatDate(rwr.record.visitDate),
                style = MaterialTheme.typography.bodyMedium,
            )
        }

        if (rwr.record.notes.isNotBlank()) {
            DetailSection(title = "Notes") {
                Text(
                    text = rwr.record.notes,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }

        rwr.vitals?.let { VitalsSection(it) }

        if (rwr.medications.isNotEmpty()) {
            DetailSection(title = "Medications") {
                rwr.medications.forEach { med ->
                    MedicationRow(med)
                    Spacer(modifier = Modifier.height(4.dp))
                }
            }
        }

        if (rwr.diagnoses.isNotEmpty()) {
            DetailSection(title = "Diagnoses") {
                rwr.diagnoses.forEach { diag ->
                    DiagnosisRow(diag)
                    Spacer(modifier = Modifier.height(4.dp))
                }
            }
        }

        if (rwr.attachments.isNotEmpty()) {
            DetailSection(title = "Attachments (${rwr.attachments.size})") {
                rwr.attachments.forEach { att ->
                    Text(
                        text = att.fileName,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                }
            }
        }

        if (!rwr.record.isSynced) {
            Text(
                text = "Pending sync",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.tertiary,
            )
        }
    }
}

@Composable
private fun VitalsSection(vitals: VitalsEntity) {
    DetailSection(title = "Vitals") {
        val rows = buildList {
            if (vitals.bloodPressureSystolic != null && vitals.bloodPressureDiastolic != null) {
                add("Blood Pressure" to "${vitals.bloodPressureSystolic}/${vitals.bloodPressureDiastolic} mmHg")
            }
            if (vitals.heartRateBpm != null) add("Heart Rate" to "${vitals.heartRateBpm} bpm")
            if (vitals.weightKg != null) add("Weight" to "${vitals.weightKg} kg")
            if (vitals.temperatureCelsius != null) add("Temperature" to "${vitals.temperatureCelsius} °C")
        }
        rows.forEach { (label, value) ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(value, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun MedicationRow(med: MedicationEntity) {
    Column {
        Text(med.name, style = MaterialTheme.typography.bodyMedium)
        Text(
            "${med.doseAmount} ${med.doseUnit} — ${med.frequency}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun DiagnosisRow(diag: DiagnosisEntity) {
    Column {
        Text(diag.code, style = MaterialTheme.typography.bodyMedium)
        Text(
            diag.description,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun DetailSection(
    title: String,
    content: @Composable () -> Unit,
) {
    Column {
        Text(
            text = title,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.primary,
        )
        Spacer(modifier = Modifier.height(4.dp))
        HorizontalDivider()
        Spacer(modifier = Modifier.height(8.dp))
        content()
    }
}

private fun formatDate(epochMillis: Long): String =
    SimpleDateFormat("MMMM d, yyyy", Locale.getDefault()).format(Date(epochMillis))