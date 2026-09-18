const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const { getUnits, saveUnits } = require('../units'); // Ajusta la ruta a tu módulo de almacenamiento según la estructura de tu proyecto

const upload = multer({ storage: multer.memoryStorage() });

// GET: Obtener todas las unidades
router.get('/', async (req, res) => {
    try {
        const units = await getUnits();
        res.json(units);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener las unidades.' });
    }
});

// POST /add: Agregar manualmente una o varias unidades a las existentes
router.post('/add', async (req, res) => {
    try {
        const currentUnits = await getUnits();
        const newUnitsData = Array.isArray(req.body) ? req.body : [req.body];

        const formattedNewUnits = newUnitsData.map((u, index) => ({
            id: u.id || `u_${Date.now()}_${index}`,
            unidad: u.unidad || u.id || '',
            piso: u.piso || '',
            depto: u.depto || '',
            propietario: u.propietario || ''
        }));

        const updatedUnits = [...currentUnits, ...formattedNewUnits];
        await saveUnits(updatedUnits);

        res.json({ success: true, message: 'Unidades agregadas con éxito.', added: formattedNewUnits.length });
    } catch (error) {
        res.status(500).json({ error: 'Error al agregar unidades.' });
    }
});

// POST /import-excel: Importar unidades desde un archivo Excel
router.post('/import-excel', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se subió ningún archivo Excel.' });
        }

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        const importedUnits = rows.map((row, index) => ({
            id: String(row['Unidad'] || row['unidad'] || `u_${Date.now()}_${index}`),
            unidad: String(row['Unidad'] || row['unidad'] || ''),
            piso: String(row['Piso'] || row['piso'] || ''),
            depto: String(row['Depto'] || row['depto'] || ''),
            propietario: String(row['Propietario'] || row['propietario'] || '')
        }));

        const replaceAll = req.query.replace === 'true';
        let finalUnits = [];

        if (replaceAll) {
            finalUnits = importedUnits;
        } else {
            const currentUnits = await getUnits();
            finalUnits = [...currentUnits, ...importedUnits];
        }

        await saveUnits(finalUnits);

        res.json({
            success: true,
            message: `Se importaron ${importedUnits.length} unidades correctamente.`,
            count: importedUnits.length
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al procesar el archivo Excel.' });
    }
});

// DELETE /delete: Eliminar unidades (todas o seleccionadas)
router.delete('/delete', async (req, res) => {
    try {
        const { ids, deleteAll } = req.body;

        if (deleteAll) {
            await saveUnits([]);
            return res.json({ success: true, message: 'Todas las unidades han sido eliminadas.' });
        }

        if (Array.isArray(ids) && ids.length > 0) {
            const currentUnits = await getUnits();
            const filteredUnits = currentUnits.filter(u => !ids.includes(String(u.id)) && !ids.includes(String(u.unidad)));
            await saveUnits(filteredUnits);
            return res.json({ success: true, message: 'Unidades seleccionadas eliminadas.' });
        }

        res.status(400).json({ error: 'Parámetros de eliminación inválidos.' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar unidades.' });
    }
});

module.exports = router;
