const ABI_MAGIC: i32 = 0x4c46_5750;
const ABI_VERSION: i32 = 1;
const SMOKE_LAYOUT_ID: i32 = 0x1500_0001;
const SMOKE_OPCODE_ADD: i32 = 1;

const STATUS_OK: i32 = 0;
const STATUS_BAD_LENGTH: i32 = -1;
const STATUS_BAD_MAGIC: i32 = -2;
const STATUS_BAD_VERSION: i32 = -3;
const STATUS_BAD_LAYOUT: i32 = -4;
const STATUS_BAD_OPCODE: i32 = -5;
const STATUS_OVERFLOW: i32 = -6;
const STATUS_NULL_POINTER: i32 = -7;

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

fn read_i32(input: &[u8], offset: usize) -> i32 {
    i32::from_le_bytes([
        input[offset],
        input[offset + 1],
        input[offset + 2],
        input[offset + 3],
    ])
}
