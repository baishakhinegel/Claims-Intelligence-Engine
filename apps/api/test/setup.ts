import { Logger } from '@nestjs/common';

// Keep test output readable — service logs are asserted via behaviour, not stdout.
Logger.overrideLogger(false);
