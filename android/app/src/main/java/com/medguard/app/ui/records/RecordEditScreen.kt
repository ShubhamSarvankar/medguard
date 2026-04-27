package com.medguard.app.ui.records

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.medguard.app.data.local.db.AttachmentEntity
import com.medguard.app.data.local.db.DiagnosisEntity
import com.medguard.app.data.local.db.MedicationEntity
import com.medguard.app.data.local.db.VitalsEntity
import java.util.UUID

private const val NEW_RECORD_ID = "new"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecordEditScreen(
    recordId: String,
    ownerUid: String,
    onNavigateBack: () -> Unit,
    viewModel: RecordsViewModel = hiltViewModel(),
) {
    val isCreating = recordId == NEW_RECORD_ID
    val detailState by viewModel.detailUiState.collectAsStateWithLifecycle()
    val editState by viewModel.editUiState.collectAsStateWithLifecycle()
    val isOffline by viewModel.isOffline.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current

    LaunchedEffect(recordId) {
        if (!isCreating) viewModel.loadRecord(recordId)
    }

    val existingRecord = (detailState as? RecordDetailUiState.Success)?.record

    var title by remember(existingRecord) {
        mutableStateOf(existingRecord?.record?.title ?: "")
    }
    var notes by remember(existingRecord) {
        mutableStateOf(existingRecord?.record?.notes ?: "")
    }
    var visitDateMillis by remember(existingRecord) {
        mutableLongStateOf(existingRecord?.record?.visitDate ?: System.currentTimeMillis())
    }

    var bpSystolic by remember(existingRecord) {
        mutableStateOf(existingRecord?.vitals?.bloodPressureSystolic?.toString() ?: "")
    }
    var bpDiastolic by remember(existingRecord) {
        mutableStateOf(existingRecord?.vitals?.bloodPressureDiastolic?.toString() ?: "")
    }
    var heartRate by remember(existingRecord) {
        mutableStateOf(existingRecord?.vitals?.heartRateBpm?.toString() ?: "")
    }
    var weight by remember(existingRecord) {
        mutableStateOf(existingRecord?.vitals?.weightKg?.toString() ?: "")
    }
    var temperature by remember(existingRecord) {
        mutableStateOf(existingRecord?.vitals?.temperatureCelsius?.toString() ?: "")
    }

    val medications = remember(existingRecord) {
        mutableStateListOf<MedicationEntity>().apply {
            existingRecord?.medications?.let { addAll(it) }
        }
    }
    val diagnoses = remember(existingRecord) {
        mutableStateListOf<DiagnosisEntity>().apply {
            existingRecord?.diagnoses?.let { addAll(it) }
        }
    }
    val attachments = remember(existingRecord) {
        mutableStateListOf<AttachmentEntity>().apply {
            existingRecord?.attachments?.let { addAll(it) }
        }
    }

    var titleError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        viewModel.attachmentErrors.collect { error ->
            snackbarHostState.showSnackbar("${error.fileName}: ${error.reason}")
        }
    }

    LaunchedEffect(editState) {
        when (editState) {
            is RecordEditUiState.Saved -> {
                viewModel.resetEditState()
                onNavigateBack()
            }
            is RecordEditUiState.Error -> {
                snackbarHostState.showSnackbar((editState as RecordEditUiState.Error).message)
                viewModel.resetEditState()
            }
            else -> Unit
        }
    }

    val filePicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        uri ?: return@rememberLauncherForActivityResult
        val resolver = context.contentResolver
        val mimeType = resolver.getType(uri) ?: return@rememberLauncherForActivityResult
        val sizeBytes = resolver.openFileDescriptor(uri, "r")?.use { it.statSize } ?: 0L
        val fileName = uri.lastPathSegment ?: "attachment"

        val valid = viewModel.validateAndAddAttachment(
            fileName = fileName,
            mimeType = mimeType,
            sizeBytes = sizeBytes,
            currentCount = attachments.size,
        )
        if (valid) {
            attachments.add(
                AttachmentEntity(
                    attachmentId = UUID.randomUUID().toString(),
                    recordId = if (isCreating) "" else recordId,
                    fileName = fileName,
                    mimeType = mimeType,
                    localFilePath = uri.toString(),
                    storagePath = null,
                    sizeBytes = sizeBytes,
                    uploadedAt = null,
                    // TODO Phase 4: call StorageDataSource.uploadAttachment(uri) here
                    // once StorageDataSource is fully implemented.
                )
            )
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (isCreating) "New Record" else "Edit Record") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        Box(modifier = Modifier.padding(innerPadding)) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                OutlinedTextField(
                    value = title,
                    onValueChange = {
                        title = it
                        titleError = if (it.isBlank()) "Title is required." else null
                    },
                    label = { Text("Title *") },
                    isError = titleError != null,
                    supportingText = titleError?.let { { Text(it) } },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )

                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    label = { Text("Notes") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3,
                    maxLines = 8,
                )

                EditSectionHeader("Vitals")
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedTextField(
                        value = bpSystolic,
                        onValueChange = { bpSystolic = it },
                        label = { Text("Systolic") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                    )
                    OutlinedTextField(
                        value = bpDiastolic,
                        onValueChange = { bpDiastolic = it },
                        label = { Text("Diastolic") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedTextField(
                        value = heartRate,
                        onValueChange = { heartRate = it },
                        label = { Text("HR (bpm)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                    )
                    OutlinedTextField(
                        value = weight,
                        onValueChange = { weight = it },
                        label = { Text("Weight (kg)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                    )
                    OutlinedTextField(
                        value = temperature,
                        onValueChange = { temperature = it },
                        label = { Text("Temp (°C)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                    )
                }

                EditSectionHeader("Medications")
                medications.forEachIndexed { index, med ->
                    MedicationRow(
                        med = med,
                        onRemove = { medications.removeAt(index) },
                        onUpdate = { medications[index] = it },
                    )
                }
                TextButton(
                    onClick = {
                        medications.add(
                            MedicationEntity(
                                medicationId = UUID.randomUUID().toString(),
                                recordId = "",
                                name = "",
                                doseAmount = "",
                                doseUnit = "mg",
                                frequency = "",
                                startDate = null,
                                endDate = null,
                            )
                        )
                    }
                ) {
                    Icon(Icons.Default.Add, contentDescription = null)
                    Spacer(Modifier.width(4.dp))
                    Text("Add medication")
                }

                EditSectionHeader("Diagnoses")
                diagnoses.forEachIndexed { index, diag ->
                    DiagnosisRow(
                        diag = diag,
                        onRemove = { diagnoses.removeAt(index) },
                        onUpdate = { diagnoses[index] = it },
                    )
                }
                TextButton(
                    onClick = {
                        diagnoses.add(
                            DiagnosisEntity(
                                diagnosisId = UUID.randomUUID().toString(),
                                recordId = "",
                                code = "",
                                description = "",
                                diagnosedAt = System.currentTimeMillis(),
                            )
                        )
                    }
                ) {
                    Icon(Icons.Default.Add, contentDescription = null)
                    Spacer(Modifier.width(4.dp))
                    Text("Add diagnosis")
                }

                EditSectionHeader("Attachments (${attachments.size}/10)")
                attachments.forEachIndexed { index, att ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            att.fileName,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.weight(1f),
                        )
                        IconButton(onClick = { attachments.removeAt(index) }) {
                            Icon(Icons.Default.Close, contentDescription = "Remove attachment")
                        }
                    }
                }
                TextButton(onClick = { filePicker.launch("*/*") }) {
                    Icon(Icons.Default.Add, contentDescription = null)
                    Spacer(Modifier.width(4.dp))
                    Text("Add attachment")
                }

                Spacer(Modifier.height(8.dp))

                if (isOffline) {
                    Surface(
                        color = MaterialTheme.colorScheme.errorContainer,
                        shape = MaterialTheme.shapes.small,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                imageVector = Icons.Default.WifiOff,
                                contentDescription = null,
                                modifier = Modifier.size(14.dp),
                                tint = MaterialTheme.colorScheme.onErrorContainer,
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text = "You're offline. Connect to save changes.",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onErrorContainer,
                            )
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                }

                Button(
                    onClick = {
                        if (title.isBlank()) {
                            titleError = "Title is required."
                            return@Button
                        }
                        val vitalsEntity = buildVitalsEntity(
                            recordId = if (isCreating) "" else recordId,
                            bpSystolic = bpSystolic,
                            bpDiastolic = bpDiastolic,
                            heartRate = heartRate,
                            weight = weight,
                            temperature = temperature,
                        )
                        if (isCreating) {
                            viewModel.createRecord(
                                ownerUid = ownerUid,
                                title = title,
                                notes = notes,
                                visitDateMillis = visitDateMillis,
                                vitals = vitalsEntity,
                                medications = medications.toList(),
                                diagnoses = diagnoses.toList(),
                                attachments = attachments.toList(),
                            )
                        } else {
                            val existing = existingRecord ?: return@Button
                            viewModel.updateRecord(
                                existing.copy(
                                    record = existing.record.copy(
                                        title = title,
                                        notes = notes,
                                        visitDate = visitDateMillis,
                                    ),
                                    vitals = vitalsEntity,
                                    medications = medications.toList(),
                                    diagnoses = diagnoses.toList(),
                                    attachments = attachments.toList(),
                                )
                            )
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = editState !is RecordEditUiState.Saving && !isOffline,
                ) {
                    if (editState is RecordEditUiState.Saving) {
                        CircularProgressIndicator(
                            modifier = Modifier
                                .height(18.dp)
                                .width(18.dp),
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Text(if (isCreating) "Create Record" else "Save Changes")
                    }
                }
            }
        }
    }
}

@Composable
private fun EditSectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.primary,
    )
}

@Composable
private fun MedicationRow(
    med: MedicationEntity,
    onRemove: () -> Unit,
    onUpdate: (MedicationEntity) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            OutlinedTextField(
                value = med.name,
                onValueChange = { onUpdate(med.copy(name = it)) },
                label = { Text("Name") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                OutlinedTextField(
                    value = med.doseAmount,
                    onValueChange = { onUpdate(med.copy(doseAmount = it)) },
                    label = { Text("Dose") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = med.doseUnit,
                    onValueChange = { onUpdate(med.copy(doseUnit = it)) },
                    label = { Text("Unit") },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = med.frequency,
                    onValueChange = { onUpdate(med.copy(frequency = it)) },
                    label = { Text("Frequency") },
                    modifier = Modifier.weight(2f),
                    singleLine = true,
                )
            }
        }
        IconButton(onClick = onRemove) {
            Icon(Icons.Default.Close, contentDescription = "Remove medication")
        }
    }
}

@Composable
private fun DiagnosisRow(
    diag: DiagnosisEntity,
    onRemove: () -> Unit,
    onUpdate: (DiagnosisEntity) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            OutlinedTextField(
                value = diag.code,
                onValueChange = { onUpdate(diag.copy(code = it)) },
                label = { Text("ICD-10 Code") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            OutlinedTextField(
                value = diag.description,
                onValueChange = { onUpdate(diag.copy(description = it)) },
                label = { Text("Description") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
        }
        IconButton(onClick = onRemove) {
            Icon(Icons.Default.Close, contentDescription = "Remove diagnosis")
        }
    }
}

private fun buildVitalsEntity(
    recordId: String,
    bpSystolic: String,
    bpDiastolic: String,
    heartRate: String,
    weight: String,
    temperature: String,
): VitalsEntity? {
    val systolic = bpSystolic.toIntOrNull()
    val diastolic = bpDiastolic.toIntOrNull()
    val hr = heartRate.toIntOrNull()
    val wt = weight.toFloatOrNull()
    val temp = temperature.toFloatOrNull()

    if (systolic == null && diastolic == null && hr == null && wt == null && temp == null) return null

    return VitalsEntity(
        vitalsId = UUID.randomUUID().toString(),
        recordId = recordId,
        bloodPressureSystolic = systolic,
        bloodPressureDiastolic = diastolic,
        heartRateBpm = hr,
        weightKg = wt,
        temperatureCelsius = temp,
        recordedAt = System.currentTimeMillis(),
    )
}