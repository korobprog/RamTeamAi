use keyring::Entry;

const SERVICE: &str = "dev.Neurogate.desktop";

pub fn save_secret(provider_id: &str, secret: &str) -> keyring::Result<()> {
    Entry::new(SERVICE, provider_id)?.set_password(secret)
}

pub fn delete_secret(provider_id: &str) -> keyring::Result<()> {
    Entry::new(SERVICE, provider_id)?.delete_credential()
}
