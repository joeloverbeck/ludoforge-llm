mod preview_drive;

const ABI_MAGIC: i32 = 0x4c46_5750;
const ABI_VERSION: i32 = 7;
const SMOKE_LAYOUT_ID: i32 = 0x1500_0001;
const SMOKE_OPCODE_ADD: i32 = 1;
const STACK_SIZE: usize = 256;
const BYTECODE_HEADER_WORDS: usize = 18;
const FEATURE_REF_WORDS: usize = 7;

const STATUS_OK: i32 = 0;
const STATUS_BAD_LENGTH: i32 = -1;
const STATUS_BAD_MAGIC: i32 = -2;
const STATUS_BAD_VERSION: i32 = -3;
const STATUS_BAD_LAYOUT: i32 = -4;
const STATUS_BAD_OPCODE: i32 = -5;
const STATUS_OVERFLOW: i32 = -6;
const STATUS_NULL_POINTER: i32 = -7;
const STATUS_BAD_BYTECODE_VERSION: i32 = -8;
const STATUS_STACK_UNDERFLOW: i32 = -9;
const STATUS_STACK_OVERFLOW: i32 = -10;
const STATUS_BAD_FEATURE: i32 = -11;
const STATUS_BAD_OPERAND: i32 = -12;
const STATUS_DIV_ZERO: i32 = -13;
const STATUS_UNSUPPORTED: i32 = -14;

const VALUE_UNDEFINED: i32 = 0;
const VALUE_NUMBER: i32 = 1;
const VALUE_FALSE: i32 = 2;
const VALUE_TRUE: i32 = 3;

const OP_LOAD_FEATURE: i32 = 0;
const OP_LOAD_CONST: i32 = 1;
const OP_GT: i32 = 2;
const OP_LT: i32 = 3;
const OP_EQ: i32 = 4;
const OP_NEQ: i32 = 5;
const OP_GTE: i32 = 6;
const OP_LTE: i32 = 7;
const OP_JUMP_IF_FALSE: i32 = 8;
const OP_ADD_SCORE: i32 = 9;
const OP_SUB_SCORE: i32 = 10;
const OP_MUL_SCORE: i32 = 11;
const OP_DIV_SCORE: i32 = 12;
const OP_NEG: i32 = 13;
const OP_ABS: i32 = 14;
const OP_MIN: i32 = 15;
const OP_MAX: i32 = 16;
const OP_AND: i32 = 17;
const OP_OR: i32 = 18;
const OP_NOT: i32 = 19;
const OP_COALESCE: i32 = 20;
const OP_BOOL_TO_NUMBER: i32 = 21;
const OP_IN: i32 = 22;
const OP_RESOLVE_REF: i32 = 23;
const OP_AGGREGATE_SUM: i32 = 24;
const OP_AGGREGATE_COUNT: i32 = 25;
const OP_AGGREGATE_MIN: i32 = 26;
const OP_AGGREGATE_MAX: i32 = 27;
const OP_RESOLVE_DYNAMIC: i32 = 28;
const OP_HALT: i32 = 29;

const FEATURE_GLOBAL_VAR: i32 = 1;
const FEATURE_PLAYER_INT: i32 = 2;
const FEATURE_GLOBAL_MARKER: i32 = 3;
const FEATURE_ZONE_PROP: i32 = 4;
const FEATURE_ZONE_TOKEN_AGG: i32 = 5;
const FEATURE_GLOBAL_TOKEN_AGG: i32 = 6;
const FEATURE_GLOBAL_ZONE_AGG: i32 = 7;
const FEATURE_CANDIDATE_INTRINSIC: i32 = 8;
const FEATURE_CANDIDATE_PARAM: i32 = 9;
const FEATURE_CANDIDATE_TAG: i32 = 10;
const FEATURE_CANDIDATE_TAGS: i32 = 11;
const FEATURE_CANDIDATE_FEATURE: i32 = 12;
const FEATURE_CANDIDATE_AGGREGATE: i32 = 13;
const FEATURE_STATE_FEATURE: i32 = 14;
const FEATURE_DYNAMIC_SURFACE: i32 = 15;
const FEATURE_DYNAMIC_REF: i32 = 16;

const SURFACE_SCOPE_CURRENT: i32 = 0;
const SELECTOR_NONE: i32 = 0;
const SELECTOR_PLAYER: i32 = 1;
const PLAYER_SELF: i32 = 0;
const PLAYER_ACTIVE: i32 = 1;
const ZONE_PROP_ATTRIBUTE: i32 = 0;
const AGG_COUNT: i32 = 0;
const AGG_SUM: i32 = 1;
const AGG_MIN: i32 = 2;
const AGG_MAX: i32 = 3;
const ZONE_SCOPE_ALL: i32 = 0;
const ZONE_SCOPE_BOARD: i32 = 1;
const ZONE_SCOPE_AUX: i32 = 2;
const OWNER_NONE: i32 = 0;
const OWNER_SELF: i32 = 1;
const OWNER_ACTIVE: i32 = 2;
const CANDIDATE_INTRINSIC_ACTION_ID: i32 = 0;
const CANDIDATE_INTRINSIC_STABLE_MOVE_KEY: i32 = 1;
const CANDIDATE_INTRINSIC_PARAM_COUNT: i32 = 2;

const PREVIEW_OUTCOME_READY: i32 = 1;
const PREVIEW_OUTCOME_STOCHASTIC: i32 = 2;
const PREVIEW_OUTCOME_GATED: i32 = 3;
const PREVIEW_OUTCOME_FAILED: i32 = 4;
const PREVIEW_OUTCOME_UNRESOLVED: i32 = 5;

#[no_mangle]
pub extern "C" fn ludoforge_policy_vm_abi_magic() -> i32 {
    ABI_MAGIC
}

#[no_mangle]
pub extern "C" fn ludoforge_policy_vm_abi_version() -> i32 {
    ABI_VERSION
}

#[no_mangle]
pub extern "C" fn ludoforge_policy_vm_smoke_layout_id() -> i32 {
    SMOKE_LAYOUT_ID
}

#[no_mangle]
pub extern "C" fn ludoforge_policy_vm_alloc(len: usize) -> *mut u8 {
    let mut buffer = Vec::<u8>::with_capacity(len);
    let ptr = buffer.as_mut_ptr();
    core::mem::forget(buffer);
    ptr
}

#[no_mangle]
pub unsafe extern "C" fn ludoforge_policy_vm_dealloc(ptr: *mut u8, len: usize) {
    if ptr.is_null() {
        return;
    }
    drop(Vec::from_raw_parts(ptr, 0, len));
}

#[no_mangle]
pub unsafe extern "C" fn ludoforge_policy_vm_evaluate_smoke(
    input_ptr: *const u8,
    input_len: usize,
    out_score_ptr: *mut i32,
) -> i32 {
    if input_ptr.is_null() || out_score_ptr.is_null() {
        return STATUS_NULL_POINTER;
    }
    if input_len != 24 {
        return STATUS_BAD_LENGTH;
    }

    let input = core::slice::from_raw_parts(input_ptr, input_len);
    let words = [
        read_i32(input, 0),
        read_i32(input, 4),
        read_i32(input, 8),
        read_i32(input, 12),
        read_i32(input, 16),
        read_i32(input, 20),
    ];

    if words[0] != ABI_MAGIC {
        return STATUS_BAD_MAGIC;
    }
    if words[1] != ABI_VERSION {
        return STATUS_BAD_VERSION;
    }
    if words[2] != SMOKE_LAYOUT_ID {
        return STATUS_BAD_LAYOUT;
    }
    if words[3] != SMOKE_OPCODE_ADD {
        return STATUS_BAD_OPCODE;
    }

    let Some(score) = words[4].checked_add(words[5]) else {
        return STATUS_OVERFLOW;
    };
    *out_score_ptr = score;
    STATUS_OK
}

#[no_mangle]
pub unsafe extern "C" fn ludoforge_policy_vm_evaluate_bytecode(
    input_ptr: *const u8,
    input_len: usize,
    out_tag_ptr: *mut i32,
    out_value_ptr: *mut i32,
) -> i32 {
    if input_ptr.is_null() || out_tag_ptr.is_null() || out_value_ptr.is_null() {
        return STATUS_NULL_POINTER;
    }
    if input_len % 4 != 0 || input_len < BYTECODE_HEADER_WORDS * 4 {
        return STATUS_BAD_LENGTH;
    }

    let input = core::slice::from_raw_parts(input_ptr, input_len);
    let words = I32Cursor::new(input);
    match evaluate_bytecode(words) {
        Ok(value) => {
            let (tag, raw) = value.encode();
            *out_tag_ptr = tag;
            *out_value_ptr = raw;
            STATUS_OK
        }
        Err(status) => status,
    }
}

#[no_mangle]
pub unsafe extern "C" fn ludoforge_policy_vm_evaluate_bytecode_batch(
    input_ptr: *const u8,
    input_len: usize,
    out_tags_ptr: *mut i32,
    out_values_ptr: *mut i32,
    out_len: usize,
) -> i32 {
    if input_ptr.is_null() || out_tags_ptr.is_null() || out_values_ptr.is_null() {
        return STATUS_NULL_POINTER;
    }
    if input_len % 4 != 0 || input_len < 24 {
        return STATUS_BAD_LENGTH;
    }

    let input = core::slice::from_raw_parts(input_ptr, input_len);
    let mut cursor = I32Cursor::new(input);
    match evaluate_bytecode_batch(&mut cursor, out_tags_ptr, out_values_ptr, out_len) {
        Ok(()) => STATUS_OK,
        Err(status) => status,
    }
}

fn read_i32(input: &[u8], offset: usize) -> i32 {
    i32::from_le_bytes([
        input[offset],
        input[offset + 1],
        input[offset + 2],
        input[offset + 3],
    ])
}

#[derive(Clone, Copy)]
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

    fn read_many(&mut self, count: usize) -> Result<&'a [u8], i32> {
        let offset = self.word.checked_mul(4).ok_or(STATUS_BAD_LENGTH)?;
        let len = count.checked_mul(4).ok_or(STATUS_BAD_LENGTH)?;
        if offset + len > self.bytes.len() {
            return Err(STATUS_BAD_LENGTH);
        }
        self.word += count;
        Ok(&self.bytes[offset..offset + len])
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Value {
    Undefined,
    Number(i32),
    Bool(bool),
}

impl Value {
    fn encode(self) -> (i32, i32) {
        match self {
            Value::Undefined => (VALUE_UNDEFINED, 0),
            Value::Number(value) => (VALUE_NUMBER, value),
            Value::Bool(false) => (VALUE_FALSE, 0),
            Value::Bool(true) => (VALUE_TRUE, 1),
        }
    }

    fn as_number(self) -> Option<i32> {
        match self {
            Value::Number(value) => Some(value),
            _ => None,
        }
    }
}

#[derive(Clone, Copy)]
struct Header {
    instruction_count: usize,
    constant_count: usize,
    feature_ref_count: usize,
    active_player: i32,
    player_id: i32,
    zone_count: usize,
    token_count: usize,
    player_count: usize,
    scalar_prop_count: usize,
    global_var_count: usize,
    per_player_var_count: usize,
    zone_var_count: usize,
}

#[derive(Clone, Copy)]
struct FeatureRef {
    kind: i32,
    layout_index: i32,
    aux: [i32; 5],
}

struct Program<'a> {
    header: Header,
    instructions: &'a [u8],
    constants: &'a [u8],
    feature_refs: Vec<FeatureRef>,
    zone_kinds: Vec<i32>,
    token_zone: Vec<i32>,
    token_occurrence_offset: Vec<i32>,
    token_occurrence_count: Vec<i32>,
    token_occurrence_zones: Vec<i32>,
    token_scalar_prop_values: Vec<i32>,
    token_scalar_prop_present: Vec<i32>,
    player_ints: Vec<i32>,
    zone_ints: Vec<i32>,
    globals: Vec<i32>,
    global_markers: Vec<u64>,
}

#[derive(Clone, Copy)]
struct CandidateParam {
    code: i32,
    value: Value,
}

struct BatchCandidate {
    action_id_code: i32,
    stable_move_key_code: i32,
    params: Vec<CandidateParam>,
    tags: Vec<i32>,
}

struct PrecomputedCandidateFeature {
    code: i32,
    values: Vec<Value>,
}

struct PrecomputedPreviewCandidateFeature {
    code: i32,
    outcomes: Vec<i32>,
    values: Vec<Value>,
}

struct BatchPrecomputed {
    state_features: Vec<CandidateParam>,
    candidate_features: Vec<PrecomputedCandidateFeature>,
    preview_candidate_features: Vec<PrecomputedPreviewCandidateFeature>,
    dynamic_candidate_features: Vec<PrecomputedCandidateFeature>,
    aggregates: Vec<CandidateParam>,
}

fn as_usize(value: i32) -> Result<usize, i32> {
    if value < 0 {
        return Err(STATUS_BAD_LENGTH);
    }
    Ok(value as usize)
}

fn read_i32_vec(cursor: &mut I32Cursor<'_>, count: usize) -> Result<Vec<i32>, i32> {
    let mut values = Vec::with_capacity(count);
    for _ in 0..count {
        values.push(cursor.read()?);
    }
    Ok(values)
}

fn read_u64_vec(cursor: &mut I32Cursor<'_>, count: usize) -> Result<Vec<u64>, i32> {
    let mut values = Vec::with_capacity(count);
    for _ in 0..count {
        let low = cursor.read()? as u32 as u64;
        let high = cursor.read()? as u32 as u64;
        values.push(low | (high << 32));
    }
    Ok(values)
}

fn parse_program(mut cursor: I32Cursor<'_>) -> Result<Program<'_>, i32> {
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
    if cursor.read()? != 1 || cursor.read()? != 1 {
        return Err(STATUS_BAD_BYTECODE_VERSION);
    }

    let header = Header {
        instruction_count: as_usize(cursor.read()?)?,
        constant_count: as_usize(cursor.read()?)?,
        feature_ref_count: as_usize(cursor.read()?)?,
        active_player: cursor.read()?,
        player_id: cursor.read()?,
        zone_count: as_usize(cursor.read()?)?,
        token_count: as_usize(cursor.read()?)?,
        player_count: as_usize(cursor.read()?)?,
        scalar_prop_count: as_usize(cursor.read()?)?,
        global_var_count: as_usize(cursor.read()?)?,
        per_player_var_count: as_usize(cursor.read()?)?,
        zone_var_count: as_usize(cursor.read()?)?,
    };

    let instructions = cursor.read_many(header.instruction_count)?;
    let constants = cursor.read_many(header.constant_count)?;
    let mut feature_refs = Vec::with_capacity(header.feature_ref_count);
    for _ in 0..header.feature_ref_count {
        let mut record = [0; FEATURE_REF_WORDS];
        for item in record.iter_mut() {
            *item = cursor.read()?;
        }
        feature_refs.push(FeatureRef {
            kind: record[0],
            layout_index: record[1],
            aux: [record[2], record[3], record[4], record[5], record[6]],
        });
    }

    let zone_kinds = read_i32_vec(&mut cursor, header.zone_count)?;
    let token_zone = read_i32_vec(&mut cursor, header.token_count)?;
    let token_occurrence_offset = read_i32_vec(&mut cursor, header.token_count)?;
    let token_occurrence_count = read_i32_vec(&mut cursor, header.token_count)?;
    let token_occurrence_zones_len = as_usize(cursor.read()?)?;
    let token_occurrence_zones = read_i32_vec(&mut cursor, token_occurrence_zones_len)?;
    let token_scalar_len = header
        .token_count
        .checked_mul(header.scalar_prop_count)
        .ok_or(STATUS_BAD_LENGTH)?;
    let token_scalar_prop_values = read_i32_vec(&mut cursor, token_scalar_len)?;
    let token_scalar_prop_present = read_i32_vec(&mut cursor, token_scalar_len)?;
    let player_ints = read_i32_vec(
        &mut cursor,
        header
            .player_count
            .checked_mul(header.per_player_var_count)
            .ok_or(STATUS_BAD_LENGTH)?,
    )?;
    let zone_ints = read_i32_vec(
        &mut cursor,
        header
            .zone_count
            .checked_mul(header.zone_var_count)
            .ok_or(STATUS_BAD_LENGTH)?,
    )?;
    let globals = read_i32_vec(&mut cursor, header.global_var_count)?;
    let global_marker_count = as_usize(cursor.read()?)?;
    let global_markers = read_u64_vec(&mut cursor, global_marker_count)?;

    if cursor.word * 4 != cursor.bytes.len() {
        return Err(STATUS_BAD_LENGTH);
    }

    Ok(Program {
        header,
        instructions,
        constants,
        feature_refs,
        zone_kinds,
        token_zone,
        token_occurrence_offset,
        token_occurrence_count,
        token_occurrence_zones,
        token_scalar_prop_values,
        token_scalar_prop_present,
        player_ints,
        zone_ints,
        globals,
        global_markers,
    })
}

fn read_word(words: &[u8], index: usize) -> Result<i32, i32> {
    let offset = index.checked_mul(4).ok_or(STATUS_BAD_OPERAND)?;
    if offset + 4 > words.len() {
        return Err(STATUS_BAD_OPERAND);
    }
    Ok(read_i32(words, offset))
}

fn pop(stack: &mut Vec<Value>) -> Result<Value, i32> {
    stack.pop().ok_or(STATUS_STACK_UNDERFLOW)
}

fn push(stack: &mut Vec<Value>, value: Value) -> Result<(), i32> {
    if stack.len() >= STACK_SIZE {
        return Err(STATUS_STACK_OVERFLOW);
    }
    stack.push(value);
    Ok(())
}

fn binary_numeric<F>(stack: &mut Vec<Value>, apply: F) -> Result<(), i32>
where
    F: FnOnce(i32, i32) -> Result<i32, i32>,
{
    let right = pop(stack)?.as_number();
    let left = pop(stack)?.as_number();
    push(
        stack,
        match (left, right) {
            (Some(left), Some(right)) => Value::Number(apply(left, right)?),
            _ => Value::Undefined,
        },
    )
}

fn binary_compare<F>(stack: &mut Vec<Value>, apply: F) -> Result<(), i32>
where
    F: FnOnce(i32, i32) -> bool,
{
    let right = pop(stack)?.as_number();
    let left = pop(stack)?.as_number();
    push(
        stack,
        match (left, right) {
            (Some(left), Some(right)) => Value::Bool(apply(left, right)),
            _ => Value::Undefined,
        },
    )
}

fn token_occurrences_in_zone(program: &Program<'_>, token_index: usize, zone_index: usize) -> i32 {
    let occurrence_count = *program
        .token_occurrence_count
        .get(token_index)
        .unwrap_or(&0);
    if occurrence_count <= 0 {
        return 0;
    }
    if occurrence_count == 1 {
        return if program.token_zone.get(token_index).copied() == Some(zone_index as i32) {
            1
        } else {
            0
        };
    }
    let offset = *program
        .token_occurrence_offset
        .get(token_index)
        .unwrap_or(&-1);
    if offset < 0 {
        return 0;
    }
    let mut count = 0;
    for occurrence in 0..occurrence_count as usize {
        if program
            .token_occurrence_zones
            .get(offset as usize + occurrence)
            .copied()
            == Some(zone_index as i32)
        {
            count += 1;
        }
    }
    count
}

fn token_numeric_prop(program: &Program<'_>, token_index: usize, prop_index: i32) -> Option<i32> {
    if prop_index < 0 {
        return None;
    }
    let scalar_index = token_index
        .checked_mul(program.header.scalar_prop_count)?
        .checked_add(prop_index as usize)?;
    if program
        .token_scalar_prop_present
        .get(scalar_index)
        .copied()
        .unwrap_or(0)
        == 1
    {
        program.token_scalar_prop_values.get(scalar_index).copied()
    } else {
        None
    }
}

fn aggregate_values(values: &[i32], op_code: i32) -> Result<Value, i32> {
    if op_code == AGG_COUNT {
        return Ok(Value::Number(values.len() as i32));
    }
    if values.is_empty() {
        return Ok(if op_code == AGG_SUM {
            Value::Number(0)
        } else {
            Value::Undefined
        });
    }
    let result = match op_code {
        AGG_SUM => values.iter().try_fold(0i32, |sum, value| {
            sum.checked_add(*value).ok_or(STATUS_OVERFLOW)
        })?,
        AGG_MIN => *values.iter().min().ok_or(STATUS_BAD_FEATURE)?,
        AGG_MAX => *values.iter().max().ok_or(STATUS_BAD_FEATURE)?,
        _ => return Err(STATUS_BAD_FEATURE),
    };
    Ok(Value::Number(result))
}

fn zone_matches_scope(zone_kind: i32, scope_code: i32) -> bool {
    scope_code == ZONE_SCOPE_ALL
        || (scope_code == ZONE_SCOPE_BOARD && zone_kind == 1)
        || (scope_code == ZONE_SCOPE_AUX && zone_kind == 2)
}

fn resolve_player_index(
    program: &Program<'_>,
    selector_code: i32,
    selector_value: i32,
) -> Option<usize> {
    if selector_code == SELECTOR_NONE {
        return Some(program.header.player_id as usize);
    }
    if selector_code != SELECTOR_PLAYER {
        return None;
    }
    if selector_value == PLAYER_SELF {
        Some(program.header.player_id as usize)
    } else if selector_value == PLAYER_ACTIVE {
        Some(program.header.active_player as usize)
    } else {
        None
    }
}

fn resolve_feature(
    program: &Program<'_>,
    candidate: Option<&BatchCandidate>,
    candidate_index: Option<usize>,
    precomputed: Option<&BatchPrecomputed>,
    feature: FeatureRef,
) -> Result<Value, i32> {
    match feature.kind {
        FEATURE_GLOBAL_VAR => {
            if feature.aux[0] != SURFACE_SCOPE_CURRENT {
                return Err(STATUS_UNSUPPORTED);
            }
            Ok(program
                .globals
                .get(feature.layout_index as usize)
                .copied()
                .map(Value::Number)
                .unwrap_or(Value::Undefined))
        }
        FEATURE_PLAYER_INT => {
            if feature.aux[0] != SURFACE_SCOPE_CURRENT {
                return Err(STATUS_UNSUPPORTED);
            }
            let Some(player_index) = resolve_player_index(program, feature.aux[1], feature.aux[2])
            else {
                return Ok(Value::Undefined);
            };
            let index = player_index
                .checked_mul(program.header.per_player_var_count)
                .and_then(|base| base.checked_add(feature.layout_index as usize))
                .ok_or(STATUS_BAD_FEATURE)?;
            Ok(program
                .player_ints
                .get(index)
                .copied()
                .map(Value::Number)
                .unwrap_or(Value::Undefined))
        }
        FEATURE_GLOBAL_MARKER => {
            let _ = program.global_markers.len();
            Err(STATUS_UNSUPPORTED)
        }
        FEATURE_ZONE_PROP => {
            if feature.aux[0] == ZONE_PROP_ATTRIBUTE {
                return Ok(Value::Undefined);
            }
            let index = (feature.layout_index as usize)
                .checked_mul(program.header.zone_var_count)
                .and_then(|base| base.checked_add(feature.aux[1] as usize))
                .ok_or(STATUS_BAD_FEATURE)?;
            Ok(program
                .zone_ints
                .get(index)
                .copied()
                .map(Value::Number)
                .unwrap_or(Value::Undefined))
        }
        FEATURE_ZONE_TOKEN_AGG => {
            let owner_code = feature.aux[0];
            if owner_code != OWNER_NONE && owner_code != OWNER_SELF && owner_code != OWNER_ACTIVE {
                return Ok(Value::Undefined);
            }
            let prop_index = feature.aux[1];
            let op_code = feature.aux[2];
            let mut values = Vec::new();
            for token_index in 0..program.header.token_count {
                let occurrence_count =
                    token_occurrences_in_zone(program, token_index, feature.layout_index as usize);
                if occurrence_count == 0 {
                    continue;
                }
                if op_code == AGG_COUNT {
                    let value = token_numeric_prop(program, token_index, prop_index);
                    if value.is_some() {
                        for _ in 0..occurrence_count {
                            values.push(value.unwrap());
                        }
                    }
                    continue;
                }
                if let Some(value) = token_numeric_prop(program, token_index, prop_index) {
                    for _ in 0..occurrence_count {
                        values.push(value);
                    }
                }
            }
            if op_code == AGG_COUNT {
                Ok(Value::Number(values.len() as i32))
            } else {
                aggregate_values(&values, op_code)
            }
        }
        FEATURE_GLOBAL_TOKEN_AGG => {
            let op_code = feature.aux[0];
            let scope_code = feature.aux[1];
            let prop_index = feature.aux[2];
            let token_filter_code = feature.aux[3];
            let zone_filter_code = feature.aux[4];
            if token_filter_code != 0 || zone_filter_code != 0 {
                return Err(STATUS_UNSUPPORTED);
            }
            let mut values = Vec::new();
            for token_index in 0..program.header.token_count {
                let mut occurrence_count = 0;
                for zone_index in 0..program.header.zone_count {
                    if zone_matches_scope(program.zone_kinds[zone_index], scope_code) {
                        occurrence_count +=
                            token_occurrences_in_zone(program, token_index, zone_index);
                    }
                }
                if occurrence_count == 0 {
                    continue;
                }
                if op_code == AGG_COUNT {
                    for _ in 0..occurrence_count {
                        values.push(1);
                    }
                    continue;
                }
                if let Some(value) = token_numeric_prop(program, token_index, prop_index) {
                    for _ in 0..occurrence_count {
                        values.push(value);
                    }
                }
            }
            if op_code == AGG_COUNT {
                Ok(Value::Number(values.len() as i32))
            } else {
                aggregate_values(&values, op_code)
            }
        }
        FEATURE_GLOBAL_ZONE_AGG => {
            let source = feature.aux[0];
            let field = feature.aux[1];
            let op_code = feature.aux[2];
            let scope_code = feature.aux[3];
            let zone_filter_code = feature.aux[4];
            if zone_filter_code != 0 {
                return Err(STATUS_UNSUPPORTED);
            }
            let mut values = Vec::new();
            for zone_index in 0..program.header.zone_count {
                if !zone_matches_scope(program.zone_kinds[zone_index], scope_code) {
                    continue;
                }
                if op_code == AGG_COUNT {
                    values.push(1);
                    continue;
                }
                if source != 0 {
                    let index = zone_index
                        .checked_mul(program.header.zone_var_count)
                        .and_then(|base| base.checked_add(field as usize))
                        .ok_or(STATUS_BAD_FEATURE)?;
                    if let Some(value) = program.zone_ints.get(index) {
                        values.push(*value);
                    }
                }
            }
            if op_code == AGG_COUNT {
                Ok(Value::Number(values.len() as i32))
            } else {
                aggregate_values(&values, op_code)
            }
        }
        FEATURE_CANDIDATE_INTRINSIC => {
            let Some(candidate) = candidate else {
                return Err(STATUS_UNSUPPORTED);
            };
            match feature.aux[0] {
                CANDIDATE_INTRINSIC_ACTION_ID => Ok(Value::Number(candidate.action_id_code)),
                CANDIDATE_INTRINSIC_STABLE_MOVE_KEY => {
                    Ok(Value::Number(candidate.stable_move_key_code))
                }
                CANDIDATE_INTRINSIC_PARAM_COUNT => Ok(Value::Number(candidate.params.len() as i32)),
                _ => Err(STATUS_BAD_FEATURE),
            }
        }
        FEATURE_CANDIDATE_PARAM => {
            let Some(candidate) = candidate else {
                return Err(STATUS_UNSUPPORTED);
            };
            Ok(candidate
                .params
                .iter()
                .find(|param| param.code == feature.aux[0])
                .map(|param| param.value)
                .unwrap_or(Value::Undefined))
        }
        FEATURE_CANDIDATE_TAG => {
            let Some(candidate) = candidate else {
                return Err(STATUS_UNSUPPORTED);
            };
            Ok(Value::Bool(candidate.tags.contains(&feature.aux[0])))
        }
        FEATURE_CANDIDATE_FEATURE => {
            let Some(candidate_index) = candidate_index else {
                return Err(STATUS_UNSUPPORTED);
            };
            let Some(precomputed) = precomputed else {
                return Err(STATUS_UNSUPPORTED);
            };
            if let Some(value) = precomputed
                .candidate_features
                .iter()
                .find(|row| row.code == feature.aux[0])
                .and_then(|row| row.values.get(candidate_index).copied())
            {
                return Ok(value);
            }
            Ok(precomputed
                .preview_candidate_features
                .iter()
                .find(|row| row.code == feature.aux[0])
                .and_then(|row| {
                    let outcome = *row.outcomes.get(candidate_index)?;
                    match outcome {
                        PREVIEW_OUTCOME_READY
                        | PREVIEW_OUTCOME_STOCHASTIC
                        | PREVIEW_OUTCOME_GATED
                        | PREVIEW_OUTCOME_FAILED
                        | PREVIEW_OUTCOME_UNRESOLVED => row.values.get(candidate_index).copied(),
                        _ => None,
                    }
                })
                .unwrap_or(Value::Undefined))
        }
        FEATURE_CANDIDATE_AGGREGATE => {
            let Some(precomputed) = precomputed else {
                return Err(STATUS_UNSUPPORTED);
            };
            Ok(precomputed
                .aggregates
                .iter()
                .find(|row| row.code == feature.aux[0])
                .map(|row| row.value)
                .unwrap_or(Value::Undefined))
        }
        FEATURE_STATE_FEATURE => {
            let Some(precomputed) = precomputed else {
                return Err(STATUS_UNSUPPORTED);
            };
            Ok(precomputed
                .state_features
                .iter()
                .find(|row| row.code == feature.aux[0])
                .map(|row| row.value)
                .unwrap_or(Value::Undefined))
        }
        FEATURE_DYNAMIC_SURFACE => {
            let Some(candidate_index) = candidate_index else {
                return Err(STATUS_UNSUPPORTED);
            };
            let Some(precomputed) = precomputed else {
                return Err(STATUS_UNSUPPORTED);
            };
            Ok(precomputed
                .dynamic_candidate_features
                .iter()
                .find(|row| row.code == feature.aux[1])
                .and_then(|row| row.values.get(candidate_index).copied())
                .unwrap_or(Value::Undefined))
        }
        FEATURE_DYNAMIC_REF => {
            let Some(candidate_index) = candidate_index else {
                return Err(STATUS_UNSUPPORTED);
            };
            let Some(precomputed) = precomputed else {
                return Err(STATUS_UNSUPPORTED);
            };
            Ok(precomputed
                .dynamic_candidate_features
                .iter()
                .find(|row| row.code == feature.aux[0])
                .and_then(|row| row.values.get(candidate_index).copied())
                .unwrap_or(Value::Undefined))
        }
        FEATURE_CANDIDATE_TAGS => Err(STATUS_UNSUPPORTED),
        _ => Err(STATUS_UNSUPPORTED),
    }
}

fn evaluate_bytecode(cursor: I32Cursor<'_>) -> Result<Value, i32> {
    let program = parse_program(cursor)?;
    evaluate_program(&program, None, None, None)
}

fn evaluate_program(
    program: &Program<'_>,
    candidate: Option<&BatchCandidate>,
    candidate_index: Option<usize>,
    precomputed: Option<&BatchPrecomputed>,
) -> Result<Value, i32> {
    let mut stack: Vec<Value> = Vec::with_capacity(STACK_SIZE);
    let mut pc = 0usize;

    while pc < program.header.instruction_count {
        let opcode = read_word(program.instructions, pc)?;
        pc += 1;
        match opcode {
            OP_LOAD_FEATURE => {
                let feature_id = read_word(program.instructions, pc)? as usize;
                pc += 1;
                let feature = *program
                    .feature_refs
                    .get(feature_id)
                    .ok_or(STATUS_BAD_FEATURE)?;
                let value =
                    resolve_feature(program, candidate, candidate_index, precomputed, feature)?;
                push(&mut stack, value)?;
            }
            OP_LOAD_CONST => {
                let constant_id = read_word(program.instructions, pc)? as usize;
                pc += 1;
                push(
                    &mut stack,
                    Value::Number(read_word(program.constants, constant_id)?),
                )?;
            }
            OP_GT => binary_compare(&mut stack, |left, right| left > right)?,
            OP_LT => binary_compare(&mut stack, |left, right| left < right)?,
            OP_EQ => {
                let right = pop(&mut stack)?;
                let left = pop(&mut stack)?;
                push(
                    &mut stack,
                    if left == Value::Undefined || right == Value::Undefined {
                        Value::Undefined
                    } else {
                        Value::Bool(left == right)
                    },
                )?;
            }
            OP_NEQ => {
                let right = pop(&mut stack)?;
                let left = pop(&mut stack)?;
                push(
                    &mut stack,
                    if left == Value::Undefined || right == Value::Undefined {
                        Value::Undefined
                    } else {
                        Value::Bool(left != right)
                    },
                )?;
            }
            OP_GTE => binary_compare(&mut stack, |left, right| left >= right)?,
            OP_LTE => binary_compare(&mut stack, |left, right| left <= right)?,
            OP_JUMP_IF_FALSE => {
                let offset = read_word(program.instructions, pc)?;
                pc += 1;
                let condition = pop(&mut stack)?;
                if condition != Value::Bool(true) {
                    if offset < 0 {
                        return Err(STATUS_BAD_OPERAND);
                    }
                    pc = pc.checked_add(offset as usize).ok_or(STATUS_BAD_OPERAND)?;
                }
            }
            OP_ADD_SCORE => binary_numeric(&mut stack, |left, right| {
                left.checked_add(right).ok_or(STATUS_OVERFLOW)
            })?,
            OP_SUB_SCORE => binary_numeric(&mut stack, |left, right| {
                left.checked_sub(right).ok_or(STATUS_OVERFLOW)
            })?,
            OP_MUL_SCORE => binary_numeric(&mut stack, |left, right| {
                left.checked_mul(right).ok_or(STATUS_OVERFLOW)
            })?,
            OP_DIV_SCORE => binary_numeric(&mut stack, |left, right| {
                if right == 0 {
                    return Err(STATUS_DIV_ZERO);
                }
                left.checked_div(right).ok_or(STATUS_OVERFLOW)
            })?,
            OP_NEG => {
                let value = pop(&mut stack)?.as_number();
                push(
                    &mut stack,
                    match value {
                        Some(value) => Value::Number(value.checked_neg().ok_or(STATUS_OVERFLOW)?),
                        None => Value::Undefined,
                    },
                )?;
            }
            OP_ABS => {
                let value = pop(&mut stack)?.as_number();
                push(
                    &mut stack,
                    match value {
                        Some(value) => Value::Number(value.checked_abs().ok_or(STATUS_OVERFLOW)?),
                        None => Value::Undefined,
                    },
                )?;
            }
            OP_MIN => binary_numeric(&mut stack, |left, right| Ok(core::cmp::min(left, right)))?,
            OP_MAX => binary_numeric(&mut stack, |left, right| Ok(core::cmp::max(left, right)))?,
            OP_AND => {
                let right = pop(&mut stack)?;
                let left = pop(&mut stack)?;
                let value = if left == Value::Bool(false) || right == Value::Bool(false) {
                    Value::Bool(false)
                } else if left == Value::Bool(true) && right == Value::Bool(true) {
                    Value::Bool(true)
                } else {
                    Value::Undefined
                };
                push(&mut stack, value)?;
            }
            OP_OR => {
                let right = pop(&mut stack)?;
                let left = pop(&mut stack)?;
                let value = if left == Value::Bool(true) || right == Value::Bool(true) {
                    Value::Bool(true)
                } else if left == Value::Bool(false) && right == Value::Bool(false) {
                    Value::Bool(false)
                } else {
                    Value::Undefined
                };
                push(&mut stack, value)?;
            }
            OP_NOT => {
                let value = pop(&mut stack)?;
                push(
                    &mut stack,
                    match value {
                        Value::Bool(value) => Value::Bool(!value),
                        _ => Value::Undefined,
                    },
                )?;
            }
            OP_COALESCE => {
                let right = pop(&mut stack)?;
                let left = pop(&mut stack)?;
                push(
                    &mut stack,
                    if left != Value::Undefined {
                        left
                    } else {
                        right
                    },
                )?;
            }
            OP_BOOL_TO_NUMBER => {
                let value = pop(&mut stack)?;
                push(
                    &mut stack,
                    match value {
                        Value::Bool(value) => Value::Number(if value { 1 } else { 0 }),
                        _ => Value::Undefined,
                    },
                )?;
            }
            OP_IN | OP_RESOLVE_REF | OP_AGGREGATE_SUM | OP_AGGREGATE_COUNT | OP_AGGREGATE_MIN
            | OP_AGGREGATE_MAX | OP_RESOLVE_DYNAMIC => return Err(STATUS_UNSUPPORTED),
            OP_HALT => return Ok(*stack.last().unwrap_or(&Value::Undefined)),
            _ => return Err(STATUS_BAD_OPCODE),
        }
    }

    Ok(*stack.last().unwrap_or(&Value::Undefined))
}

fn evaluate_bytecode_batch(
    cursor: &mut I32Cursor<'_>,
    out_tags_ptr: *mut i32,
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
    let program_word_len = as_usize(cursor.read()?)?;
    if out_len != candidate_count {
        return Err(STATUS_BAD_LENGTH);
    }

    let mut candidates = Vec::with_capacity(candidate_count);
    for _ in 0..candidate_count {
        let action_id_code = cursor.read()?;
        let stable_move_key_code = cursor.read()?;
        let param_count = as_usize(cursor.read()?)?;
        let tag_count = as_usize(cursor.read()?)?;
        let mut params = Vec::with_capacity(param_count);
        for _ in 0..param_count {
            let code = cursor.read()?;
            let tag = cursor.read()?;
            let raw = cursor.read()?;
            let value = match tag {
                VALUE_NUMBER => Value::Number(raw),
                VALUE_FALSE => Value::Bool(false),
                VALUE_TRUE => Value::Bool(true),
                VALUE_UNDEFINED => Value::Undefined,
                _ => return Err(STATUS_BAD_FEATURE),
            };
            params.push(CandidateParam { code, value });
        }
        let tags = read_i32_vec(cursor, tag_count)?;
        candidates.push(BatchCandidate {
            action_id_code,
            stable_move_key_code,
            params,
            tags,
        });
    }
    let state_feature_count = as_usize(cursor.read()?)?;
    let candidate_feature_count = as_usize(cursor.read()?)?;
    let preview_candidate_feature_count = as_usize(cursor.read()?)?;
    let dynamic_candidate_feature_count = as_usize(cursor.read()?)?;
    let aggregate_count = as_usize(cursor.read()?)?;
    let mut state_features = Vec::with_capacity(state_feature_count);
    for _ in 0..state_feature_count {
        let code = cursor.read()?;
        let tag = cursor.read()?;
        let raw = cursor.read()?;
        let value = match tag {
            VALUE_NUMBER => Value::Number(raw),
            VALUE_FALSE => Value::Bool(false),
            VALUE_TRUE => Value::Bool(true),
            VALUE_UNDEFINED => Value::Undefined,
            _ => return Err(STATUS_BAD_FEATURE),
        };
        state_features.push(CandidateParam { code, value });
    }
    let mut candidate_features = Vec::with_capacity(candidate_feature_count);
    for _ in 0..candidate_feature_count {
        let code = cursor.read()?;
        let row_count = as_usize(cursor.read()?)?;
        if row_count != candidate_count {
            return Err(STATUS_BAD_LENGTH);
        }
        let mut values = Vec::with_capacity(row_count);
        for _ in 0..row_count {
            let tag = cursor.read()?;
            let raw = cursor.read()?;
            let value = match tag {
                VALUE_NUMBER => Value::Number(raw),
                VALUE_FALSE => Value::Bool(false),
                VALUE_TRUE => Value::Bool(true),
                VALUE_UNDEFINED => Value::Undefined,
                _ => return Err(STATUS_BAD_FEATURE),
            };
            values.push(value);
        }
        candidate_features.push(PrecomputedCandidateFeature { code, values });
    }
    let mut preview_candidate_features = Vec::with_capacity(preview_candidate_feature_count);
    for _ in 0..preview_candidate_feature_count {
        let code = cursor.read()?;
        let row_count = as_usize(cursor.read()?)?;
        if row_count != candidate_count {
            return Err(STATUS_BAD_LENGTH);
        }
        let mut outcomes = Vec::with_capacity(row_count);
        let mut values = Vec::with_capacity(row_count);
        for _ in 0..row_count {
            let outcome = cursor.read()?;
            match outcome {
                PREVIEW_OUTCOME_READY
                | PREVIEW_OUTCOME_STOCHASTIC
                | PREVIEW_OUTCOME_GATED
                | PREVIEW_OUTCOME_FAILED
                | PREVIEW_OUTCOME_UNRESOLVED => outcomes.push(outcome),
                _ => return Err(STATUS_BAD_FEATURE),
            }
            let tag = cursor.read()?;
            let raw = cursor.read()?;
            let value = match tag {
                VALUE_NUMBER => Value::Number(raw),
                VALUE_FALSE => Value::Bool(false),
                VALUE_TRUE => Value::Bool(true),
                VALUE_UNDEFINED => Value::Undefined,
                _ => return Err(STATUS_BAD_FEATURE),
            };
            values.push(value);
        }
        preview_candidate_features.push(PrecomputedPreviewCandidateFeature {
            code,
            outcomes,
            values,
        });
    }
    let mut dynamic_candidate_features = Vec::with_capacity(dynamic_candidate_feature_count);
    for _ in 0..dynamic_candidate_feature_count {
        let code = cursor.read()?;
        let row_count = as_usize(cursor.read()?)?;
        if row_count != candidate_count {
            return Err(STATUS_BAD_LENGTH);
        }
        let mut values = Vec::with_capacity(row_count);
        for _ in 0..row_count {
            let tag = cursor.read()?;
            let raw = cursor.read()?;
            let value = match tag {
                VALUE_NUMBER => Value::Number(raw),
                VALUE_FALSE => Value::Bool(false),
                VALUE_TRUE => Value::Bool(true),
                VALUE_UNDEFINED => Value::Undefined,
                _ => return Err(STATUS_BAD_FEATURE),
            };
            values.push(value);
        }
        dynamic_candidate_features.push(PrecomputedCandidateFeature { code, values });
    }
    let mut aggregates = Vec::with_capacity(aggregate_count);
    for _ in 0..aggregate_count {
        let code = cursor.read()?;
        let tag = cursor.read()?;
        let raw = cursor.read()?;
        let value = match tag {
            VALUE_NUMBER => Value::Number(raw),
            VALUE_FALSE => Value::Bool(false),
            VALUE_TRUE => Value::Bool(true),
            VALUE_UNDEFINED => Value::Undefined,
            _ => return Err(STATUS_BAD_FEATURE),
        };
        aggregates.push(CandidateParam { code, value });
    }
    let program_bytes = cursor.read_many(program_word_len)?;
    if cursor.word * 4 != cursor.bytes.len() {
        return Err(STATUS_BAD_LENGTH);
    }
    let program = parse_program(I32Cursor::new(program_bytes))?;
    let precomputed = BatchPrecomputed {
        state_features,
        candidate_features,
        preview_candidate_features,
        dynamic_candidate_features,
        aggregates,
    };

    let out_tags = unsafe { core::slice::from_raw_parts_mut(out_tags_ptr, candidate_count) };
    let out_values = unsafe { core::slice::from_raw_parts_mut(out_values_ptr, candidate_count) };
    for index in 0..candidate_count {
        let value = evaluate_program(
            &program,
            candidates.get(index),
            Some(index),
            Some(&precomputed),
        )?;
        let (tag, raw) = value.encode();
        out_tags[index] = tag;
        out_values[index] = raw;
    }
    Ok(())
}
