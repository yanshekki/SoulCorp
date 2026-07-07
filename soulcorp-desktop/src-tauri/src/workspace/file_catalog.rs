use super::models::WorkspaceFileKind;

#[derive(Debug, Clone)]
pub struct FileTypeInfo {
    pub extension: String,
    pub mime_type: String,
    pub kind: WorkspaceFileKind,
    pub icon: &'static str,
}

pub fn classify_file_name(name: &str) -> Result<FileTypeInfo, String> {
    let extension = name
        .rsplit('.')
        .next()
        .map(|part| part.to_ascii_lowercase())
        .filter(|part| !part.is_empty() && name.contains('.'))
        .ok_or_else(|| "File must have a supported extension.".to_string())?;

    if BLOCKED_EXTENSIONS.contains(&extension.as_str()) {
        return Err(format!(
            ".{extension} files cannot be imported for security reasons."
        ));
    }

    classify_extension(&extension).ok_or_else(|| {
        format!(
            ".{extension} is not supported. Try images, PDF, Office docs, text, or archives."
        )
    })
}

pub fn classify_extension(extension: &str) -> Option<FileTypeInfo> {
    let extension = extension.to_ascii_lowercase();
    let (mime_type, kind, icon) = match extension.as_str() {
        "jpg" | "jpeg" => ("image/jpeg", WorkspaceFileKind::Image, "🖼"),
        "png" => ("image/png", WorkspaceFileKind::Image, "🖼"),
        "gif" => ("image/gif", WorkspaceFileKind::Image, "🖼"),
        "webp" => ("image/webp", WorkspaceFileKind::Image, "🖼"),
        "svg" => ("image/svg+xml", WorkspaceFileKind::Image, "🖼"),
        "bmp" => ("image/bmp", WorkspaceFileKind::Image, "🖼"),
        "heic" | "heif" => ("image/heic", WorkspaceFileKind::Image, "🖼"),
        "pdf" => ("application/pdf", WorkspaceFileKind::Pdf, "📕"),
        "doc" => (
            "application/msword",
            WorkspaceFileKind::Document,
            "📄",
        ),
        "docx" => (
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            WorkspaceFileKind::Document,
            "📄",
        ),
        "rtf" => ("application/rtf", WorkspaceFileKind::Document, "📄"),
        "odt" => ("application/vnd.oasis.opendocument.text", WorkspaceFileKind::Document, "📄"),
        "xls" => (
            "application/vnd.ms-excel",
            WorkspaceFileKind::Spreadsheet,
            "📊",
        ),
        "xlsx" => (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            WorkspaceFileKind::Spreadsheet,
            "📊",
        ),
        "csv" => ("text/csv", WorkspaceFileKind::Spreadsheet, "📊"),
        "ods" => (
            "application/vnd.oasis.opendocument.spreadsheet",
            WorkspaceFileKind::Spreadsheet,
            "📊",
        ),
        "ppt" => (
            "application/vnd.ms-powerpoint",
            WorkspaceFileKind::Presentation,
            "📽",
        ),
        "pptx" => (
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            WorkspaceFileKind::Presentation,
            "📽",
        ),
        "odp" => (
            "application/vnd.oasis.opendocument.presentation",
            WorkspaceFileKind::Presentation,
            "📽",
        ),
        "txt" | "md" | "markdown" => ("text/plain", WorkspaceFileKind::Text, "📝"),
        "json" | "yaml" | "yml" | "xml" => ("text/plain", WorkspaceFileKind::Text, "📝"),
        "zip" => ("application/zip", WorkspaceFileKind::Archive, "🗜"),
        "rar" => ("application/vnd.rar", WorkspaceFileKind::Archive, "🗜"),
        "7z" => ("application/x-7z-compressed", WorkspaceFileKind::Archive, "🗜"),
        "tar" | "gz" | "tgz" => ("application/gzip", WorkspaceFileKind::Archive, "🗜"),
        "mp4" | "m4v" => ("video/mp4", WorkspaceFileKind::Video, "🎬"),
        "webm" => ("video/webm", WorkspaceFileKind::Video, "🎬"),
        "mov" => ("video/quicktime", WorkspaceFileKind::Video, "🎬"),
        "mp3" => ("audio/mpeg", WorkspaceFileKind::Audio, "🎵"),
        "wav" => ("audio/wav", WorkspaceFileKind::Audio, "🎵"),
        "ogg" | "m4a" => ("audio/ogg", WorkspaceFileKind::Audio, "🎵"),
        _ => return None,
    };

    Some(FileTypeInfo {
        extension,
        mime_type: mime_type.to_string(),
        kind,
        icon,
    })
}

pub fn dialog_extension_filters() -> Vec<(&'static str, Vec<&'static str>)> {
    vec![
        (
            "Images",
            vec!["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "heic", "heif"],
        ),
        ("PDF", vec!["pdf"]),
        (
            "Documents",
            vec!["doc", "docx", "rtf", "odt", "txt", "md", "markdown"],
        ),
        (
            "Spreadsheets",
            vec!["xls", "xlsx", "csv", "ods"],
        ),
        (
            "Presentations",
            vec!["ppt", "pptx", "odp"],
        ),
        ("Archives", vec!["zip", "rar", "7z", "tar", "gz", "tgz"]),
        ("Video", vec!["mp4", "m4v", "webm", "mov"]),
        ("Audio", vec!["mp3", "wav", "ogg", "m4a"]),
        ("Data", vec!["json", "yaml", "yml", "xml"]),
    ]
}

const BLOCKED_EXTENSIONS: &[&str] = &[
    "exe", "msi", "bat", "cmd", "com", "scr", "sh", "bash", "zsh", "app", "dmg", "deb", "rpm",
    "apk", "jar", "wasm", "dll", "so", "dylib", "bin", "iso",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_common_formats() {
        let pdf = classify_file_name("Quarterly Report.PDF").expect("pdf");
        assert_eq!(pdf.extension, "pdf");
        assert_eq!(pdf.kind, WorkspaceFileKind::Pdf);

        let image = classify_file_name("photo.jpeg").expect("jpeg");
        assert_eq!(image.kind, WorkspaceFileKind::Image);

        let sheet = classify_file_name("budget.xlsx").expect("xlsx");
        assert_eq!(sheet.kind, WorkspaceFileKind::Spreadsheet);
    }

    #[test]
    fn rejects_executables() {
        assert!(classify_file_name("virus.exe").is_err());
    }
}