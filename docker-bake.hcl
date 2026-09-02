variable "IMAGE" {
  default = "registry.idri.edu.kh/makerspacecadt/maker_web_cadt"
}

variable "TAG" {
  default = "latest"
}

variable "VITE_BACKEND_URL" {
  default = ""
}

group "default" {
  targets = ["app"]
}

target "app" {
  context   = "."
  platforms = ["linux/amd64"]
  tags      = ["${IMAGE}:${TAG}"]
  args = {
    VITE_BACKEND_URL = "${VITE_BACKEND_URL}"
  }
}

