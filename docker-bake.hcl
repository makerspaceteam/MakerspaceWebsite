variable "IMAGE" {
  default = "makerspacecadt/maker_web_cadt"
}

variable "TAG" {
  default = "latest"
}

variable "VITE_BACKEND_URL" {
  default = "https://makerspace.idri.edu.kh"
}

group "default" {
  targets = ["app"]
}

target "app" {
  context   = "."
  platforms = ["linux/amd64", "linux/arm64"]
  tags      = ["${IMAGE}:${TAG}"]
  args = {
    VITE_BACKEND_URL = "${VITE_BACKEND_URL}"
  }
}