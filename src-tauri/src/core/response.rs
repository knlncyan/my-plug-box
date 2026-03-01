use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub code: String,
    pub message: String,
    pub data: Option<T>,
}

impl<T> ApiResponse<T> {
    /// 通用构造函数
    pub fn success(data: T, message: String) -> Self {
        ApiResponse {
            success: true,
            code: "SUCCESS".to_string(),
            message: message,
            data: Some(data),
        }
    }

    pub fn warning(message: String) -> Self {
        ApiResponse {
            success: false,
            code: "WARNING".to_string(),
            message: message,
            data: None,
        }
    }
}

impl ApiResponse<()> {
    pub fn ok() -> Self {
        ApiResponse {
            success: true,
            code: "SUCCESS".to_string(),
            message: "Ok".to_string(),
            data: Some(()),
        }
    }
}
