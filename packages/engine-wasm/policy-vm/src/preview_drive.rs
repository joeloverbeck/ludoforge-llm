const ABI_MAGIC: i32 = 0x4c46_5750;
const ABI_VERSION: i32 = 7;

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

const OP_ADD_GLOBAL: i32 = 1;
const OP_CHOOSE_ONE_GREEDY: i32 = 2;
const OP_CHOOSE_N_GREEDY: i32 = 3;
const OP_STOCHASTIC: i32 = 4;
const OP_UNSUPPORTED: i32 = 5;
const OP_APPLY_CANDIDATE_DELTAS: i32 = 6;

#[no_mangle]
pub unsafe extern "C" fn ludoforge_policy_vm_evaluate_preview_drive_batch(
    input_ptr: *const u8,
    input_len: usize,
    out_outcomes_ptr: *mut i32,
    out_depths_ptr: *mut i32,
    out_values_ptr: *mut i32,
    out_len: usize,
) -> i32 {
    if input_ptr.is_null()
        || out_outcomes_ptr.is_null()
        || out_depths_ptr.is_null()
        || out_values_ptr.is_null()
    {
        return STATUS_NULL_POINTER;
    }
    if input_len % 4 != 0 || input_len < 36 {
        return STATUS_BAD_LENGTH;
    }

    let input = core::slice::from_raw_parts(input_ptr, input_len);
    let mut cursor = I32Cursor::new(input);
    match evaluate_preview_drive_batch(
        &mut cursor,
        out_outcomes_ptr,
        out_depths_ptr,
        out_values_ptr,
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
    let depth_cap = cursor.read()?;
    if depth_cap <= 0 {
        return Err(STATUS_BAD_OPERAND);
    }
    let origin_seat_code = cursor.read()?;
    let origin_turn_id = cursor.read()?;
    let step_count = as_usize(cursor.read()?)?;

    let mut states = Vec::with_capacity(candidate_count);
    for _ in 0..candidate_count {
        let _action_id_code = cursor.read()?;
        let _stable_move_key_code = cursor.read()?;
        states.push(PreviewDriveState {
            outcome: OUTCOME_COMPLETED,
            depth: 0,
            value: cursor.read()?,
        });
    }

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
                if min < 0 || max < min || max as usize > option_count {
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
                let step_depth = min.checked_add(1).ok_or(STATUS_OVERFLOW)?;
                for state in states.iter_mut() {
                    if state.outcome != OUTCOME_COMPLETED || !same_microturn {
                        continue;
                    }
                    state.depth = state.depth.checked_add(step_depth).ok_or(STATUS_OVERFLOW)?;
                    state.value = state
                        .value
                        .checked_add(selected_sum)
                        .ok_or(STATUS_OVERFLOW)?;
                    if state.depth >= depth_cap {
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

#[derive(Clone, Copy)]
struct PreviewDriveState {
    outcome: i32,
    depth: i32,
    value: i32,
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
