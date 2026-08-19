import { BackupDestination } from "./base.js";

// ── Not yet implemented ──────────────────────────────────────────────────
// These exist so the destination type/registry surface is complete and the
// frontend can offer them (greyed out) without special-casing "types that
// don't exist yet". Each `test()` returns a graceful, user-facing message
// instead of throwing, since the UI's "Test connection" button expects a
// result object for every destination type.
//
// Deferred: SMB/Samba support would mount the share (e.g. shelling out to
// `mount -t cifs` on Linux, or a userspace SMB client library) and copy
// through the mount point. Not started — no user has requested this
// destination type yet, and it needs platform-specific mount handling.
export class SmbDestination extends BackupDestination {
  async test() {
    return {
      success: false,
      message: "SMB/Samba destinations are not implemented yet.",
    };
  }
}

// Deferred: FTP support would use a lightweight FTP client (e.g.
// `basic-ftp`). Not added as a dependency since no destination type
// currently uses it.
export class FtpDestination extends BackupDestination {
  async test() {
    return {
      success: false,
      message: "FTP destinations are not implemented yet.",
    };
  }
}

// Deferred: rsync support would shell out to the system `rsync` binary over
// SSH (`rsync -az -e ssh`), mirroring the zstd-availability-check pattern in
// utils/tarArchive.js — detect the binary, then spawn it with the backup
// file as the single source. Not started — needs an SSH-reachable target
// to test against.
export class RsyncDestination extends BackupDestination {
  async test() {
    return {
      success: false,
      message: "Rsync destinations are not implemented yet.",
    };
  }
}
