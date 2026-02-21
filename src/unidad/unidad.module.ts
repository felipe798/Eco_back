import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UnidadEntity } from './entities/unidad.entity';
import { UnidadService } from './services/unidad.service';
import { UnidadController } from './controllers/unidad.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UnidadEntity])],
  controllers: [UnidadController],
  providers: [UnidadService],
  exports: [UnidadService],
})
export class UnidadModule {}
