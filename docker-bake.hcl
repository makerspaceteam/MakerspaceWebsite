variable "IMAGE" {
  default = "makerspacecadt/maker_web_cadt"
}

variable "TAG" {
  default = "latest"
}

group "default" {
  targets = ["app"]
}

target "app" {
  context   = "."
  platforms = ["linux/amd64", "linux/arm64"]
  tags      = ["${IMAGE}:${TAG}"]
}
