const ABI_MAGIC: i32 = 0x4c46_5750;
const ABI_VERSION: i32 = 16;

const STATUS_OK: i32 = 0;
const STATUS_BAD_LENGTH: i32 = -1;
const STATUS_BAD_MAGIC: i32 = -2;
const STATUS_BAD_VERSION: i32 = -3;
const STATUS_BAD_LAYOUT: i32 = -4;
const STATUS_BAD_OPCODE: i32 = -5;
const STATUS_OVERFLOW: i32 = -6;
const STATUS_NULL_POINTER: i32 = -7;
const STATUS_BAD_OPERAND: i32 = -12;
const STATUS_UNSUPPORTED: i32 = -14;

const OUTCOME_COMPLETED: i32 = 1;
const OUTCOME_STOCHASTIC: i32 = 2;
const OUTCOME_DEPTH_CAP: i32 = 3;
const OUTCOME_FAILED: i32 = 4;

const PREVIEW_STATUS_READY: i32 = 1;
const PREVIEW_STATUS_STOCHASTIC: i32 = 2;
const PREVIEW_STATUS_HIDDEN: i32 = 3;
const PREVIEW_STATUS_UNRESOLVED: i32 = 4;
const PREVIEW_STATUS_FAILED: i32 = 5;
const PREVIEW_STATUS_DEPTH_CAP: i32 = 6;
const PREVIEW_STATUS_GATED: i32 = 7;

const PREVIEW_BRANCH_NONE: i32 = 0;
const PREVIEW_BRANCH_GREEDY: i32 = 1;
const PREVIEW_BRANCH_CONTINUED_DEEPENING: i32 = 2;

const DECISION_STACK_FRAME_WORDS: usize = 6;
const COMPLETION_RECORD_WORDS: usize = 3;
const CANDIDATE_GROUP_METADATA_WORDS: usize = 3;
const DECISION_STACK_FRAME_ACTION_SELECTION: i32 = 1;
const DECISION_STACK_FRAME_CHOOSE_ONE: i32 = 2;
const DECISION_STACK_FRAME_CHOOSE_N_STEP: i32 = 3;
const DECISION_STACK_FRAME_STOCHASTIC_RESOLVE: i32 = 4;
const DECISION_STACK_FRAME_OUTCOME_GRANT_RESOLVE: i32 = 5;
const DECISION_STACK_FRAME_TURN_RETIREMENT: i32 = 6;
const PREVIEW_STATE_SLOT_METADATA_WORDS: usize = 3;
const STATE_PATCH_OP_WORDS: usize = 5;
const PREVIEW_STATE_SLOT_KIND_GLOBAL: i32 = 1;
const PREVIEW_STATE_SLOT_KIND_FEATURE: i32 = 2;
const PREVIEW_STATE_SLOT_KIND_SURFACE: i32 = 3;
const PREVIEW_STATE_SLOT_KIND_GENERIC: i32 = 4;
const PREVIEW_STATE_SLOT_LIFETIME_SINGLE_ITERATION: i32 = 1;
const PREVIEW_STATE_SLOT_LIFETIME_CROSS_ITERATION: i32 = 2;

const OP_ADD_GLOBAL: i32 = 1;
const OP_CHOOSE_ONE_GREEDY: i32 = 2;
const OP_CHOOSE_N_GREEDY: i32 = 3;
const OP_STOCHASTIC: i32 = 4;
const OP_UNSUPPORTED: i32 = 5;
const OP_APPLY_CANDIDATE_DELTAS: i32 = 6;
const OP_SET_GLOBAL: i32 = 7;
const OP_ADD_PREVIEW_SLOT: i32 = 8;
const OP_SET_PREVIEW_SLOT: i32 = 9;

#[no_mangle]
pub unsafe extern "C" fn ludoforge_policy_vm_evaluate_preview_drive_batch(
    input_ptr: *const u8,
    input_len: usize,
    out_outcomes_ptr: *mut i32,
    out_depths_ptr: *mut i32,
    out_values_ptr: *mut i32,
    out_preview_state_ptr: *mut i32,
    out_preview_statuses_ptr: *mut i32,
    out_preview_branches_ptr: *mut i32,
    out_tiebreak_after_preview_no_signal_ptr: *mut i32,
    out_policy_preview_signal_unavailable_ptr: *mut i32,
    out_candidate_group_metadata_ptr: *mut i32,
    out_candidate_group_metadata_len: usize,
    out_decision_stack_publication_ptr: *mut i32,
    out_decision_stack_publication_len: usize,
    out_completion_records_ptr: *mut i32,
    out_completion_records_len: usize,
    out_preview_state_slot_metadata_ptr: *mut i32,
    out_preview_state_slot_metadata_len: usize,
    out_state_patch_counts_ptr: *mut i32,
    out_state_patch_ops_ptr: *mut i32,
    out_state_patch_ops_len: usize,
    out_preview_state_len: usize,
    out_len: usize,
) -> i32 {
    if input_ptr.is_null()
        || out_outcomes_ptr.is_null()
        || out_depths_ptr.is_null()
        || out_values_ptr.is_null()
        || out_preview_state_ptr.is_null()
        || out_preview_statuses_ptr.is_null()
        || out_preview_branches_ptr.is_null()
        || out_tiebreak_after_preview_no_signal_ptr.is_null()
        || out_policy_preview_signal_unavailable_ptr.is_null()
        || out_candidate_group_metadata_ptr.is_null()
        || out_decision_stack_publication_ptr.is_null()
        || out_completion_records_ptr.is_null()
        || out_preview_state_slot_metadata_ptr.is_null()
        || out_state_patch_counts_ptr.is_null()
        || out_state_patch_ops_ptr.is_null()
    {
        return STATUS_NULL_POINTER;
    }
    if input_len % 4 != 0 || input_len < 56 {
        return STATUS_BAD_LENGTH;
    }

    let input = core::slice::from_raw_parts(input_ptr, input_len);
    let mut cursor = I32Cursor::new(input);
    match evaluate_preview_drive_batch(
        &mut cursor,
        out_outcomes_ptr,
        out_depths_ptr,
        out_values_ptr,
        out_preview_state_ptr,
        out_preview_statuses_ptr,
        out_preview_branches_ptr,
        out_tiebreak_after_preview_no_signal_ptr,
        out_policy_preview_signal_unavailable_ptr,
        out_candidate_group_metadata_ptr,
        out_candidate_group_metadata_len,
        out_decision_stack_publication_ptr,
        out_decision_stack_publication_len,
        out_completion_records_ptr,
        out_completion_records_len,
        out_preview_state_slot_metadata_ptr,
        out_preview_state_slot_metadata_len,
        out_state_patch_counts_ptr,
        out_state_patch_ops_ptr,
        out_state_patch_ops_len,
        out_preview_state_len,
        out_len,
    ) {
        Ok(()) => STATUS_OK,
        Err(status) => status,
    }
}

fn evaluate_preview_drive_batch(
    cursor: &mut I32Cursor<'_>,
    out_outcomes_ptr: *mut i32,
    out_depths_ptr: *mut i32,
    out_values_ptr: *mut i32,
    out_preview_state_ptr: *mut i32,
    out_preview_statuses_ptr: *mut i32,
    out_preview_branches_ptr: *mut i32,
    out_tiebreak_after_preview_no_signal_ptr: *mut i32,
    out_policy_preview_signal_unavailable_ptr: *mut i32,
    out_candidate_group_metadata_ptr: *mut i32,
    out_candidate_group_metadata_len: usize,
    out_decision_stack_publication_ptr: *mut i32,
    out_decision_stack_publication_len: usize,
    out_completion_records_ptr: *mut i32,
    out_completion_records_len: usize,
    out_preview_state_slot_metadata_ptr: *mut i32,
    out_preview_state_slot_metadata_len: usize,
    out_state_patch_counts_ptr: *mut i32,
    out_state_patch_ops_ptr: *mut i32,
    out_state_patch_ops_len: usize,
    out_preview_state_len: usize,
    out_len: usize,
) -> Result<(), i32> {
    if cursor.read()? != ABI_MAGIC {
        return Err(STATUS_BAD_MAGIC);
    }
    if cursor.read()? != ABI_VERSION {
        return Err(STATUS_BAD_VERSION);
    }
    let expected_layout_id = cursor.read()?;
    let actual_layout_id = cursor.read()?;
    if expected_layout_id != actual_layout_id {
        return Err(STATUS_BAD_LAYOUT);
    }
    let candidate_count = as_usize(cursor.read()?)?;
    if candidate_count != out_len {
        return Err(STATUS_BAD_LENGTH);
    }
    let expected_candidate_group_words = candidate_count
        .checked_mul(CANDIDATE_GROUP_METADATA_WORDS)
        .ok_or(STATUS_OVERFLOW)?;
    if expected_candidate_group_words != out_candidate_group_metadata_len {
        return Err(STATUS_BAD_LENGTH);
    }
    let depth_cap = cursor.read()?;
    if depth_cap <= 0 {
        return Err(STATUS_BAD_OPERAND);
    }
    let origin_seat_code = cursor.read()?;
    let origin_turn_id = cursor.read()?;
    let step_count = as_usize(cursor.read()?)?;
    let preview_state_slot_count = as_usize(cursor.read()?)?;
    let decision_stack_max_depth = as_usize(cursor.read()?)?;
    let completion_record_max_count = as_usize(cursor.read()?)?;
    let materialize_state_patch = read_bool_flag(cursor.read()?)? == 1;
    let state_patch_max_op_count = as_usize(cursor.read()?)?;
    if preview_state_slot_count != out_preview_state_len {
        return Err(STATUS_BAD_LENGTH);
    }
    if preview_state_slot_count > depth_cap as usize {
        return Err(STATUS_BAD_OPERAND);
    }
    if completion_record_max_count > depth_cap as usize {
        return Err(STATUS_BAD_OPERAND);
    }
    if state_patch_max_op_count > depth_cap as usize {
        return Err(STATUS_BAD_OPERAND);
    }
    let expected_state_patch_op_words = candidate_count
        .checked_mul(state_patch_max_op_count)
        .and_then(|count| count.checked_mul(STATE_PATCH_OP_WORDS))
        .ok_or(STATUS_OVERFLOW)?;
    if expected_state_patch_op_words != out_state_patch_ops_len {
        return Err(STATUS_BAD_LENGTH);
    }
    let expected_slot_metadata_words = preview_state_slot_count
        .checked_mul(PREVIEW_STATE_SLOT_METADATA_WORDS)
        .ok_or(STATUS_OVERFLOW)?;
    if expected_slot_metadata_words != out_preview_state_slot_metadata_len {
        return Err(STATUS_BAD_LENGTH);
    }
    let expected_decision_stack_words = candidate_count
        .checked_mul(decision_stack_max_depth)
        .and_then(|count| count.checked_mul(DECISION_STACK_FRAME_WORDS))
        .ok_or(STATUS_OVERFLOW)?;
    if expected_decision_stack_words != out_decision_stack_publication_len {
        return Err(STATUS_BAD_LENGTH);
    }
    let expected_completion_record_words = candidate_count
        .checked_mul(completion_record_max_count)
        .and_then(|count| count.checked_mul(COMPLETION_RECORD_WORDS))
        .ok_or(STATUS_OVERFLOW)?;
    if expected_completion_record_words != out_completion_records_len {
        return Err(STATUS_BAD_LENGTH);
    }
    let mut preview_state_slots = Vec::with_capacity(preview_state_slot_count);
    for _ in 0..preview_state_slot_count {
        let id_code = cursor.read()?;
        let kind = read_preview_state_slot_kind(cursor.read()?)?;
        let lifetime = read_preview_state_slot_lifetime(cursor.read()?)?;
        preview_state_slots.push(PreviewStateSlot {
            id_code,
            kind,
            lifetime,
        });
    }

    let mut states = Vec::with_capacity(candidate_count);
    for _ in 0..candidate_count {
        let _action_id_code = cursor.read()?;
        let _stable_move_key_code = cursor.read()?;
        let initial_value = cursor.read()?;
        let candidate_group = read_candidate_group(cursor)?;
        let mut preview_state_values = Vec::with_capacity(preview_state_slot_count);
        for _ in 0..preview_state_slot_count {
            preview_state_values.push(cursor.read()?);
        }
        let preview_signal_carrier_explicit = read_bool_flag(cursor.read()?)?;
        let preview_status = read_preview_status(cursor.read()?)?;
        let preview_branch = read_preview_branch(cursor.read()?)?;
        let tiebreak_after_preview_no_signal = read_bool_flag(cursor.read()?)?;
        let policy_preview_signal_unavailable = read_bool_flag(cursor.read()?)?;
        let decision_stack_publication_max_depth = as_usize(cursor.read()?)?;
        let decision_stack_frame_count = as_usize(cursor.read()?)?;
        if decision_stack_publication_max_depth > decision_stack_max_depth
            || decision_stack_frame_count > decision_stack_publication_max_depth
        {
            return Err(STATUS_BAD_OPERAND);
        }
        let mut decision_stack_publication = Vec::with_capacity(decision_stack_frame_count);
        let mut previous_depth = -1i32;
        for _ in 0..decision_stack_frame_count {
            let frame_id = cursor.read()?;
            let parent_frame_id = cursor.read()?;
            let turn_id = cursor.read()?;
            let frame_depth = cursor.read()?;
            let frame_variant = read_decision_stack_frame_variant(cursor.read()?)?;
            let context_code = cursor.read()?;
            if frame_id < 0
                || parent_frame_id < -1
                || turn_id < 0
                || frame_depth < 0
                || frame_depth <= previous_depth
                || frame_depth as usize >= decision_stack_publication_max_depth
            {
                return Err(STATUS_BAD_OPERAND);
            }
            previous_depth = frame_depth;
            decision_stack_publication.extend_from_slice(&[
                frame_id,
                parent_frame_id,
                turn_id,
                frame_depth,
                frame_variant,
                context_code,
            ]);
        }
        let completion_record_count = as_usize(cursor.read()?)?;
        if completion_record_count > completion_record_max_count {
            return Err(STATUS_BAD_OPERAND);
        }
        let mut continued_deepening_completion_records =
            Vec::with_capacity(completion_record_count * COMPLETION_RECORD_WORDS);
        let mut previous_iteration_index = -1i32;
        for _ in 0..completion_record_count {
            let iteration_index = cursor.read()?;
            let residual_budget = cursor.read()?;
            let outcome = read_outcome(cursor.read()?)?;
            if iteration_index < 0
                || iteration_index <= previous_iteration_index
                || residual_budget < 0
                || residual_budget > depth_cap
            {
                return Err(STATUS_BAD_OPERAND);
            }
            previous_iteration_index = iteration_index;
            continued_deepening_completion_records.extend_from_slice(&[
                iteration_index,
                residual_budget,
                outcome,
            ]);
        }
        let mut state_patch_ops = Vec::new();
        if materialize_state_patch {
            let state_patch_op_count = as_usize(cursor.read()?)?;
            if state_patch_op_count > state_patch_max_op_count {
                return Err(STATUS_BAD_OPERAND);
            }
            state_patch_ops = Vec::with_capacity(state_patch_op_count * STATE_PATCH_OP_WORDS);
            for _ in 0..state_patch_op_count {
                let op_code = cursor.read()?;
                let word1 = cursor.read()?;
                let word2 = cursor.read()?;
                let word3 = cursor.read()?;
                let word4 = cursor.read()?;
                validate_state_patch_op(op_code, word1, word2, word3, word4)?;
                state_patch_ops.extend_from_slice(&[op_code, word1, word2, word3, word4]);
            }
        }
        states.push(PreviewDriveState {
            outcome: OUTCOME_COMPLETED,
            depth: 0,
            value: initial_value,
            preview_state_values,
            preview_signal_carrier_explicit,
            preview_status,
            preview_branch,
            tiebreak_after_preview_no_signal,
            policy_preview_signal_unavailable,
            candidate_group,
            decision_stack_publication,
            continued_deepening_completion_records,
            state_patch_ops,
        });
    }
    validate_candidate_groups(&states)?;

    for _ in 0..step_count {
        let op = cursor.read()?;
        match op {
            OP_ADD_GLOBAL => {
                let delta = cursor.read()?;
                for state in states.iter_mut() {
                    if state.outcome != OUTCOME_COMPLETED {
                        continue;
                    }
                    state.depth = state.depth.checked_add(1).ok_or(STATUS_OVERFLOW)?;
                    state.value = state.value.checked_add(delta).ok_or(STATUS_OVERFLOW)?;
                    state.add_to_primary_preview_state_value(delta)?;
                    if state.depth >= depth_cap {
                        state.outcome = OUTCOME_DEPTH_CAP;
                    }
                }
            }
            OP_SET_GLOBAL => {
                let value = cursor.read()?;
                for state in states.iter_mut() {
                    if state.outcome != OUTCOME_COMPLETED {
                        continue;
                    }
                    state.depth = state.depth.checked_add(1).ok_or(STATUS_OVERFLOW)?;
                    state.value = value;
                    state.set_primary_preview_state_value(value);
                    if state.depth >= depth_cap {
                        state.outcome = OUTCOME_DEPTH_CAP;
                    }
                }
            }
            OP_ADD_PREVIEW_SLOT => {
                let slot_index = as_usize(cursor.read()?)?;
                let delta = cursor.read()?;
                if slot_index >= preview_state_slot_count {
                    return Err(STATUS_BAD_OPERAND);
                }
                for state in states.iter_mut() {
                    if state.outcome != OUTCOME_COMPLETED {
                        continue;
                    }
                    state.depth = state.depth.checked_add(1).ok_or(STATUS_OVERFLOW)?;
                    state.add_to_preview_state_value(slot_index, delta)?;
                    if slot_index == 0 {
                        state.value = state.value.checked_add(delta).ok_or(STATUS_OVERFLOW)?;
                    }
                    if state.depth >= depth_cap {
                        state.outcome = OUTCOME_DEPTH_CAP;
                    }
                }
            }
            OP_SET_PREVIEW_SLOT => {
                let slot_index = as_usize(cursor.read()?)?;
                let value = cursor.read()?;
                if slot_index >= preview_state_slot_count {
                    return Err(STATUS_BAD_OPERAND);
                }
                for state in states.iter_mut() {
                    if state.outcome != OUTCOME_COMPLETED {
                        continue;
                    }
                    state.depth = state.depth.checked_add(1).ok_or(STATUS_OVERFLOW)?;
                    state.set_preview_state_value(slot_index, value);
                    if slot_index == 0 {
                        state.value = value;
                    }
                    if state.depth >= depth_cap {
                        state.outcome = OUTCOME_DEPTH_CAP;
                    }
                }
            }
            OP_CHOOSE_ONE_GREEDY => {
                let seat_code = cursor.read()?;
                let turn_id = cursor.read()?;
                let option_count = as_usize(cursor.read()?)?;
                let mut selected_delta = 0;
                for index in 0..option_count {
                    let delta = cursor.read()?;
                    if index == 0 {
                        selected_delta = delta;
                    }
                }
                let same_microturn = seat_code == origin_seat_code && turn_id == origin_turn_id;
                for state in states.iter_mut() {
                    if state.outcome != OUTCOME_COMPLETED || !same_microturn {
                        continue;
                    }
                    state.depth = state.depth.checked_add(1).ok_or(STATUS_OVERFLOW)?;
                    state.value = state
                        .value
                        .checked_add(selected_delta)
                        .ok_or(STATUS_OVERFLOW)?;
                    state.add_to_primary_preview_state_value(selected_delta)?;
                    if state.depth >= depth_cap {
                        state.outcome = OUTCOME_DEPTH_CAP;
                    }
                }
            }
            OP_CHOOSE_N_GREEDY => {
                let seat_code = cursor.read()?;
                let turn_id = cursor.read()?;
                let min = cursor.read()?;
                let max = cursor.read()?;
                let option_count = as_usize(cursor.read()?)?;
                if min < 0 || max < 0 || max as usize > option_count {
                    return Err(STATUS_BAD_OPERAND);
                }
                let mut selected_sum = 0i32;
                for index in 0..option_count {
                    let delta = cursor.read()?;
                    if index < min as usize {
                        selected_sum = selected_sum.checked_add(delta).ok_or(STATUS_OVERFLOW)?;
                    }
                }
                let same_microturn = seat_code == origin_seat_code && turn_id == origin_turn_id;
                let cannot_confirm = max < min;
                let step_depth = if cannot_confirm {
                    i32::try_from(option_count)
                        .map_err(|_| STATUS_OVERFLOW)?
                        .checked_add(1)
                        .ok_or(STATUS_OVERFLOW)?
                } else {
                    min.checked_add(1).ok_or(STATUS_OVERFLOW)?
                };
                for state in states.iter_mut() {
                    if state.outcome != OUTCOME_COMPLETED || !same_microturn {
                        continue;
                    }
                    state.depth = state.depth.checked_add(step_depth).ok_or(STATUS_OVERFLOW)?;
                    state.value = state
                        .value
                        .checked_add(selected_sum)
                        .ok_or(STATUS_OVERFLOW)?;
                    state.add_to_primary_preview_state_value(selected_sum)?;
                    if cannot_confirm {
                        state.outcome = OUTCOME_FAILED;
                    } else if state.depth >= depth_cap {
                        state.outcome = OUTCOME_DEPTH_CAP;
                    }
                }
            }
            OP_STOCHASTIC => {
                for state in states.iter_mut() {
                    if state.outcome == OUTCOME_COMPLETED {
                        state.depth = state.depth.checked_add(1).ok_or(STATUS_OVERFLOW)?;
                        state.outcome = OUTCOME_STOCHASTIC;
                    }
                }
            }
            OP_UNSUPPORTED => {
                let _unsupported_class = cursor.read()?;
                return Err(STATUS_UNSUPPORTED);
            }
            OP_APPLY_CANDIDATE_DELTAS => {
                for state in states.iter_mut() {
                    let delta = cursor.read()?;
                    if state.outcome != OUTCOME_COMPLETED {
                        continue;
                    }
                    state.depth = state.depth.checked_add(1).ok_or(STATUS_OVERFLOW)?;
                    state.value = state.value.checked_add(delta).ok_or(STATUS_OVERFLOW)?;
                    state.add_to_primary_preview_state_value(delta)?;
                    if state.depth >= depth_cap {
                        state.outcome = OUTCOME_DEPTH_CAP;
                    }
                }
            }
            _ => return Err(STATUS_BAD_OPCODE),
        }
    }

    if cursor.word * 4 != cursor.bytes.len() {
        return Err(STATUS_BAD_LENGTH);
    }

    for (index, state) in states.iter().enumerate() {
        unsafe {
            *out_outcomes_ptr.add(index) = state.outcome;
            *out_depths_ptr.add(index) = state.depth;
            *out_values_ptr.add(index) = state.value;
            *out_preview_statuses_ptr.add(index) = state.preview_status();
            *out_preview_branches_ptr.add(index) = state.preview_branch;
            *out_tiebreak_after_preview_no_signal_ptr.add(index) =
                state.tiebreak_after_preview_no_signal;
            *out_policy_preview_signal_unavailable_ptr.add(index) =
                state.policy_preview_signal_unavailable;
            let candidate_group_output_base = index * CANDIDATE_GROUP_METADATA_WORDS;
            *out_candidate_group_metadata_ptr.add(candidate_group_output_base) =
                state.candidate_group.id_code;
            *out_candidate_group_metadata_ptr.add(candidate_group_output_base + 1) =
                state.candidate_group.ordinal_in_group;
            *out_candidate_group_metadata_ptr.add(candidate_group_output_base + 2) =
                state.candidate_group.group_size;
            let decision_stack_output_base =
                index * decision_stack_max_depth * DECISION_STACK_FRAME_WORDS;
            for slot in 0..(decision_stack_max_depth * DECISION_STACK_FRAME_WORDS) {
                let value = state
                    .decision_stack_publication
                    .get(slot)
                    .copied()
                    .unwrap_or(0);
                *out_decision_stack_publication_ptr.add(decision_stack_output_base + slot) = value;
            }
            let completion_record_output_base =
                index * completion_record_max_count * COMPLETION_RECORD_WORDS;
            for slot in 0..(completion_record_max_count * COMPLETION_RECORD_WORDS) {
                let value = state
                    .continued_deepening_completion_records
                    .get(slot)
                    .copied()
                    .unwrap_or(0);
                *out_completion_records_ptr.add(completion_record_output_base + slot) = value;
            }
            for (slot_index, value) in state.preview_state_values.iter().enumerate() {
                *out_preview_state_ptr.add((index * preview_state_slot_count) + slot_index) =
                    *value;
            }
            *out_state_patch_counts_ptr.add(index) =
                (state.state_patch_ops.len() / STATE_PATCH_OP_WORDS) as i32;
            let state_patch_output_base =
                index * state_patch_max_op_count * STATE_PATCH_OP_WORDS;
            for slot in 0..(state_patch_max_op_count * STATE_PATCH_OP_WORDS) {
                let value = state.state_patch_ops.get(slot).copied().unwrap_or(0);
                *out_state_patch_ops_ptr.add(state_patch_output_base + slot) = value;
            }
        }
    }
    for (slot_index, slot) in preview_state_slots.iter().enumerate() {
        let base = slot_index * PREVIEW_STATE_SLOT_METADATA_WORDS;
        unsafe {
            *out_preview_state_slot_metadata_ptr.add(base) = slot.id_code;
            *out_preview_state_slot_metadata_ptr.add(base + 1) = slot.kind;
            *out_preview_state_slot_metadata_ptr.add(base + 2) = slot.lifetime;
        }
    }
    Ok(())
}

fn read_i32(input: &[u8], offset: usize) -> i32 {
    i32::from_le_bytes([
        input[offset],
        input[offset + 1],
        input[offset + 2],
        input[offset + 3],
    ])
}

fn as_usize(value: i32) -> Result<usize, i32> {
    if value < 0 {
        return Err(STATUS_BAD_LENGTH);
    }
    Ok(value as usize)
}

fn read_bool_flag(value: i32) -> Result<i32, i32> {
    match value {
        0 | 1 => Ok(value),
        _ => Err(STATUS_BAD_OPERAND),
    }
}

fn read_preview_status(value: i32) -> Result<i32, i32> {
    match value {
        PREVIEW_STATUS_READY
        | PREVIEW_STATUS_STOCHASTIC
        | PREVIEW_STATUS_HIDDEN
        | PREVIEW_STATUS_UNRESOLVED
        | PREVIEW_STATUS_FAILED
        | PREVIEW_STATUS_DEPTH_CAP
        | PREVIEW_STATUS_GATED => Ok(value),
        _ => Err(STATUS_BAD_OPERAND),
    }
}

fn read_outcome(value: i32) -> Result<i32, i32> {
    match value {
        OUTCOME_COMPLETED | OUTCOME_STOCHASTIC | OUTCOME_DEPTH_CAP | OUTCOME_FAILED => Ok(value),
        _ => Err(STATUS_BAD_OPERAND),
    }
}

fn read_preview_branch(value: i32) -> Result<i32, i32> {
    match value {
        PREVIEW_BRANCH_NONE | PREVIEW_BRANCH_GREEDY | PREVIEW_BRANCH_CONTINUED_DEEPENING => {
            Ok(value)
        }
        _ => Err(STATUS_BAD_OPERAND),
    }
}

fn read_decision_stack_frame_variant(value: i32) -> Result<i32, i32> {
    match value {
        DECISION_STACK_FRAME_ACTION_SELECTION
        | DECISION_STACK_FRAME_CHOOSE_ONE
        | DECISION_STACK_FRAME_CHOOSE_N_STEP
        | DECISION_STACK_FRAME_STOCHASTIC_RESOLVE
        | DECISION_STACK_FRAME_OUTCOME_GRANT_RESOLVE
        | DECISION_STACK_FRAME_TURN_RETIREMENT => Ok(value),
        _ => Err(STATUS_BAD_OPERAND),
    }
}

fn read_preview_state_slot_kind(value: i32) -> Result<i32, i32> {
    match value {
        PREVIEW_STATE_SLOT_KIND_GLOBAL
        | PREVIEW_STATE_SLOT_KIND_FEATURE
        | PREVIEW_STATE_SLOT_KIND_SURFACE
        | PREVIEW_STATE_SLOT_KIND_GENERIC => Ok(value),
        _ => Err(STATUS_BAD_OPERAND),
    }
}

fn read_preview_state_slot_lifetime(value: i32) -> Result<i32, i32> {
    match value {
        PREVIEW_STATE_SLOT_LIFETIME_SINGLE_ITERATION
        | PREVIEW_STATE_SLOT_LIFETIME_CROSS_ITERATION => Ok(value),
        _ => Err(STATUS_BAD_OPERAND),
    }
}

fn read_candidate_group(cursor: &mut I32Cursor<'_>) -> Result<CandidateGroup, i32> {
    let id_code = cursor.read()?;
    let ordinal_in_group = cursor.read()?;
    let group_size = cursor.read()?;
    if id_code == 0 && ordinal_in_group == 0 && group_size == 0 {
        return Ok(CandidateGroup {
            id_code,
            ordinal_in_group,
            group_size,
        });
    }
    if id_code <= 0 || ordinal_in_group < 0 || group_size <= 0 || ordinal_in_group >= group_size {
        return Err(STATUS_BAD_OPERAND);
    }
    Ok(CandidateGroup {
        id_code,
        ordinal_in_group,
        group_size,
    })
}

fn validate_candidate_groups(states: &[PreviewDriveState]) -> Result<(), i32> {
    let mut index = 0usize;
    while index < states.len() {
        let group = states[index].candidate_group;
        if group.id_code == 0 {
            index += 1;
            continue;
        }
        let group_size = as_usize(group.group_size)?;
        if group.ordinal_in_group != 0 || index + group_size > states.len() {
            return Err(STATUS_BAD_OPERAND);
        }
        for offset in 0..group_size {
            let entry = states[index + offset].candidate_group;
            if entry.id_code != group.id_code
                || entry.group_size != group.group_size
                || entry.ordinal_in_group != offset as i32
            {
                return Err(STATUS_BAD_OPERAND);
            }
        }
        index += group_size;
    }
    Ok(())
}

fn validate_state_patch_scalar(tag: i32, value: i32) -> Result<(), i32> {
    match tag {
        1 => Ok(()),
        2 => {
            if value == 0 {
                Ok(())
            } else {
                Err(STATUS_BAD_OPERAND)
            }
        }
        3 => {
            if value == 1 {
                Ok(())
            } else {
                Err(STATUS_BAD_OPERAND)
            }
        }
        _ => Err(STATUS_BAD_OPERAND),
    }
}

fn validate_state_patch_op(
    op_code: i32,
    word1: i32,
    word2: i32,
    word3: i32,
    word4: i32,
) -> Result<(), i32> {
    match op_code {
        1 => {
            if word1 <= 0 || word4 != 0 {
                return Err(STATUS_BAD_OPERAND);
            }
            validate_state_patch_scalar(word2, word3)
        }
        2 => {
            if word1 <= 0 || word2 <= 0 || word4 != 0 {
                return Err(STATUS_BAD_OPERAND);
            }
            Ok(())
        }
        3 => {
            if word1 <= 0 || word2 <= 0 || word3 <= 0 || (word4 != 0 && word4 != 1) {
                return Err(STATUS_BAD_OPERAND);
            }
            Ok(())
        }
        4 => {
            if word1 <= 0 || word2 <= 0 {
                return Err(STATUS_BAD_OPERAND);
            }
            validate_state_patch_scalar(word3, word4)
        }
        5 => {
            if word1 <= 0 || word2 <= 0 || word3 <= 0 || word4 != 0 {
                return Err(STATUS_BAD_OPERAND);
            }
            Ok(())
        }
        6 => {
            if word1 <= 0 || word2 < 0 || word3 < 0 || word4 < 0 {
                return Err(STATUS_BAD_OPERAND);
            }
            Ok(())
        }
        7 => {
            if word1 < 0 || word2 < 0 || word3 != 0 || word4 != 0 {
                return Err(STATUS_BAD_OPERAND);
            }
            Ok(())
        }
        _ => Err(STATUS_BAD_OPERAND),
    }
}

struct PreviewStateSlot {
    id_code: i32,
    kind: i32,
    lifetime: i32,
}

#[derive(Clone, Copy)]
struct CandidateGroup {
    id_code: i32,
    ordinal_in_group: i32,
    group_size: i32,
}

#[derive(Clone)]
struct PreviewDriveState {
    outcome: i32,
    depth: i32,
    value: i32,
    preview_state_values: Vec<i32>,
    preview_signal_carrier_explicit: i32,
    preview_status: i32,
    preview_branch: i32,
    tiebreak_after_preview_no_signal: i32,
    policy_preview_signal_unavailable: i32,
    candidate_group: CandidateGroup,
    decision_stack_publication: Vec<i32>,
    continued_deepening_completion_records: Vec<i32>,
    state_patch_ops: Vec<i32>,
}

impl PreviewDriveState {
    fn preview_status(&self) -> i32 {
        if self.preview_signal_carrier_explicit == 1 {
            return self.preview_status;
        }
        match self.outcome {
            OUTCOME_COMPLETED => PREVIEW_STATUS_READY,
            OUTCOME_STOCHASTIC => PREVIEW_STATUS_STOCHASTIC,
            OUTCOME_DEPTH_CAP => PREVIEW_STATUS_DEPTH_CAP,
            OUTCOME_FAILED => PREVIEW_STATUS_FAILED,
            _ => PREVIEW_STATUS_FAILED,
        }
    }

    fn add_to_primary_preview_state_value(&mut self, delta: i32) -> Result<(), i32> {
        self.add_to_preview_state_value(0, delta)
    }

    fn add_to_preview_state_value(&mut self, slot_index: usize, delta: i32) -> Result<(), i32> {
        if let Some(value) = self.preview_state_values.get_mut(slot_index) {
            *value = value.checked_add(delta).ok_or(STATUS_OVERFLOW)?;
        }
        Ok(())
    }

    fn set_primary_preview_state_value(&mut self, next_value: i32) {
        self.set_preview_state_value(0, next_value);
    }

    fn set_preview_state_value(&mut self, slot_index: usize, next_value: i32) {
        if let Some(value) = self.preview_state_values.get_mut(slot_index) {
            *value = next_value;
        }
    }
}

struct I32Cursor<'a> {
    bytes: &'a [u8],
    word: usize,
}

impl<'a> I32Cursor<'a> {
    fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, word: 0 }
    }

    fn read(&mut self) -> Result<i32, i32> {
        let offset = self.word.checked_mul(4).ok_or(STATUS_BAD_LENGTH)?;
        if offset + 4 > self.bytes.len() {
            return Err(STATUS_BAD_LENGTH);
        }
        self.word += 1;
        Ok(read_i32(self.bytes, offset))
    }
}
