import { BackupDestination } from "./base.js";

// ── Not yet implemented ──────────────────────────────────────────────────
// These exist so the destination type/registry surface is complete and the
// frontend can offer them (greyed out) without special-casing "types that
// don't exist yet". Each `test()` returns a graceful, user-facing message
// instead of throwing, since the UI's "Test connection" button expects a
// result object for every destination type.
//
// TODO(smb): implement upload/list/download/delete by mounting the share
// (e.g. shelling out to `mount -t cifs` on Linux, or a userspace SMB client
// library) and copying through the mount point.
export class SmbDestination extends BackupDestination {
  async test() {
    return {
      success: false,
      message: "SMB/Samba destinations are not implemented yet. TODO: mount the share and copy through it.",
    };
  }
}

// TODO(ftp): implement using a lightweight FTP client (e.g. `basic-ftp`) —
// not added as a dependency yet since no destination type uses it.
export class FtpDestination extends BackupDestination {
  async test() {
    return {
      success: false,
      message: "FTP destinations are not implemented yet. TODO: add an FTP client dependency and wire it up here.",
    };
  }
}

// TODO(rsync): implement by shelling out to the system `rsync` binary over
// SSH (`rsync -az -e ssh`), mirroring the zstd-availability-check pattern in
// utils/tarArchive.js — detect the binary, then spawn it with the backup
// file as the single source.
export class RsyncDestination extends BackupDestination {
  async test() {
    return {
      success: false,
      message: "Rsync destinations are not implemented yet. TODO: shell out to the system rsync binary over SSH.",
    };
  }
}
