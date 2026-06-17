use keyring::Entry;

const SERVICE: &str = "dev.RamTeamAi.desktop";

pub fn save_secret(provider_id: &str, secret: &str) -> keyring::Result<()> {
    Entry::new(SERVICE, provider_id)?.set_password(secret)
}

pub fn has_secret(provider_id: &str) -> bool {
    Entry::new(SERVICE, provider_id)
        .and_then(|entry| entry.get_password())
        .map(|secret| !secret.is_empty())
        .unwrap_or(false)
}

pub fn get_secret(provider_id: &str) -> keyring::Result<String> {
    Entry::new(SERVICE, provider_id)?.get_password()
}

pub fn delete_secret(provider_id: &str) -> keyring::Result<()> {
    Entry::new(SERVICE, provider_id)?.delete_credential()
}
