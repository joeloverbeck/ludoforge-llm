pub const STATE_PATCH_OP_WORDS: usize = 5;

const STATUS_BAD_OPERAND: i32 = -12;

pub fn validate_state_patch_op(
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
        8 => {
            if word1 < 0 || word2 <= 0 || !matches!(word3, 1 | 2 | 3) {
                return Err(STATUS_BAD_OPERAND);
            }
            if word3 == 3 && word4 != 0 {
                return Err(STATUS_BAD_OPERAND);
            }
            if word3 != 3 && word4 <= 0 {
                return Err(STATUS_BAD_OPERAND);
            }
            Ok(())
        }
        9 => {
            if word1 < 0 || word2 <= 0 || word3 <= 0 || word4 != 0 {
                return Err(STATUS_BAD_OPERAND);
            }
            Ok(())
        }
        _ => Err(STATUS_BAD_OPERAND),
    }
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
