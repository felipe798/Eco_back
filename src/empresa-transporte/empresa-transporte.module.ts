import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmpresaTransporteEntity } from './entities/empresa-transporte.entity';
import { EmpresaTransporteService } from './services/empresa-transporte.service';
import { EmpresaTransporteController } from './controllers/empresa-transporte.controller';

@Module({
  imports: [TypeOrmModule.forFeature([EmpresaTransporteEntity])],
  controllers: [EmpresaTransporteController],
  providers: [EmpresaTransporteService],
  exports: [EmpresaTransporteService],
})
export class EmpresaTransporteModule {}
